/**
 * guardiaConversionCirugiasPdf.js
 * Generador de informe oficial en PDF para Cirugías Derivadas de Guardia Clínica (≤ 48 hs).
 * Estética idéntica a la Constancia de Asociaciones (Sanatorio Argentino):
 * - Orientación Landscape A4
 * - Header oficial azul marino (#0D3B66) con logo circular y anillo blanco
 * - Línea de acento institucional (#3B82F6)
 * - Info Bar de metadatos clínicos (Período analizado, Total cirugías, Pacientes únicos, Promedio espera, Filtro)
 * - Tarjetas KPI resumen de tiempos de resolución (<=6h, 6-12h, 12-24h, 24-48h, Cirugía frecuente)
 * - Tabla principal con autoTable estructurada y numerada
 * - Pie de página oficial con numeración en todas las hojas
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { installSafePdfText } from './gobernanzaServiceProjectPdf';

/**
 * Carga el logo oficial y lo recorta de forma circular con un canvas (anillo blanco)
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
function drawInstitutionalHeaderLandscape(doc, titleRight, subtitleRight, logoCircleBase64) {
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 14;

    // ── Barra Azul Institucional (#0D3B66) ──
    doc.setFillColor(13, 59, 102);
    doc.rect(0, 0, pageW, 30, 'F');

    // ── Logo Circular con anillo blanco ──
    const logoX = margin + 1;
    const logoY = 8;
    const logoSize = 14;

    if (logoCircleBase64) {
        doc.setFillColor(255, 255, 255);
        doc.circle(logoX + logoSize / 2, logoY + logoSize / 2, logoSize / 2 + 1.2, 'F');
        doc.addImage(logoCircleBase64, 'PNG', logoX, logoY, logoSize, logoSize);
    } else {
        doc.setFillColor(255, 255, 255);
        doc.circle(logoX + logoSize / 2, logoY + logoSize / 2, logoSize / 2, 'F');
        doc.setFontSize(7);
        doc.setTextColor(13, 59, 102);
        doc.text('SA', logoX + 3.8, logoY + logoSize / 2 + 1.5);
    }

    // ── Título y Subtítulo Izquierdo ──
    doc.setFontSize(15);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.text('SANATORIO ARGENTINO', margin + 18, 13);

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(180, 200, 220);
    doc.text('Servicio de Urgencias & Centro Quirúrgico · Auditoría de Oportunidad Clínica', margin + 18, 19.5);

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
        doc.text('Sanatorio Argentino SRL · Servicio de Urgencias & Centro Quirúrgico · Sistema ADM-QUI', margin, pageH - 5.5);
        doc.text(`Página ${p} de ${totalPages}`, pageW - margin, pageH - 5.5, { align: 'right' });
    }
}

/**
 * Formatea de forma descriptiva el período analizado
 */
function formatPeriodoDescriptivo(periodo, periodoNombre) {
    if (!periodo) return periodoNombre || 'Período en Curso';
    if (periodo === '2026-ANUAL') return 'Año 2026 Completo (Acumulado Anual)';
    
    // Si coincide con mes actual (2026-10)
    const hoy = new Date();
    const currentYearMonth = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
    if (periodo === currentYearMonth) {
        const dia = String(hoy.getDate()).padStart(2, '0');
        const mes = String(hoy.getMonth() + 1).padStart(2, '0');
        return `${periodoNombre} (01 al ${dia}/${mes} · Período en Curso)`;
    }

    return `${periodoNombre} (Mes Completo Cerrado)`;
}

/**
 * Genera y descarga el PDF con formato oficial de Asociaciones para Cirugías Derivadas de Guardia
 */
export async function exportGuardiaConversionCirugiasPdf({
    records = [],
    cirugiasStats = {},
    periodo = '2026-10',
    periodoNombre = 'Octubre 2026',
    activeFilter = 'all'
}) {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    installSafePdfText(doc);
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 14;
    const contentW = pageW - margin * 2;

    const logoCircle = await loadCircularLogoBase64();
    const periodoFullTexto = formatPeriodoDescriptivo(periodo, periodoNombre);

    // 1. Header institucional estilo Asociaciones
    drawInstitutionalHeaderLandscape(
        doc,
        'CIRUGÍAS DERIVADAS DE GUARDIA',
        `Ventana Resolutiva ≤ 48 hs · Período: ${periodoNombre}`,
        logoCircle
    );

    let y = 36;

    // 2. Info Bar (Metadatos de la Auditoría)
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(margin, y, contentW, 14, 2.5, 2.5, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.roundedRect(margin, y, contentW, 14, 2.5, 2.5, 'S');

    const filterLabelMap = {
        all: 'Todas las Derivaciones',
        menos_6h: 'Emergencias Inmediatas (≤ 6 hs)',
        de_6_12h: 'Urgencias de Guardia (6 a 12 hs)',
        de_12_24h: 'Resolución 12 a 24 hs',
        de_24_48h: 'Estabilización (24 a 48 hs)',
        urgencias: 'Urgencias y No Programadas'
    };
    const filtroTexto = filterLabelMap[activeFilter] || (activeFilter.startsWith('proc_') ? 'Por Procedimiento' : activeFilter);

    const infoItems = [
        { label: 'PERÍODO ANALIZADO', value: periodoFullTexto },
        { label: 'TOTAL CIRUGÍAS DERIVADAS', value: `${cirugiasStats.total || records.length} cirugías` },
        { label: 'PACIENTES ÚNICOS', value: `${cirugiasStats.pacientesUnicos || '-'} historias clínicas` },
        { label: 'PROMEDIO A QUIRÓFANO', value: `${cirugiasStats.avgHoras || '0'} horas` },
        { label: 'FILTRO APLICADO', value: `${filtroTexto} (${records.length})` }
    ];

    const colItemW = contentW / 5;
    infoItems.forEach((item, i) => {
        const itemX = margin + colItemW * i + 4;
        doc.setFontSize(6);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(148, 163, 184); // slate-400
        doc.text(item.label, itemX, y + 4.5);

        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(13, 59, 102); // Navy Blue
        const truncatedVal = item.value.length > 34 ? item.value.substring(0, 32) + '...' : item.value;
        doc.text(truncatedVal, itemX, y + 10.5);
    });

    y += 18;

    // 3. Grid de Tarjetas KPI (Cards estilo Asociaciones)
    const kpiCards = [
        {
            title: 'EMERGENCIA INMEDIATA (≤ 6 HS)',
            val: `${cirugiasStats.menos6h || 0} cirugías`,
            sub: `${cirugiasStats.menos6hPct || '0'}% resuelto en ≤ 6 hs`,
            borderColor: [16, 185, 129], // Verde Esmeralda
            textColor: [5, 150, 105]
        },
        {
            title: 'URGENCIA GUARDIA (6 - 12 HS)',
            val: `${cirugiasStats.de6a12h || 0} cirugías`,
            sub: `${cirugiasStats.de6a12hPct || '0'}% turno de guardia`,
            borderColor: [37, 99, 235], // Azul Zafiro
            textColor: [29, 78, 216]
        },
        {
            title: 'RESOLUCIÓN EN 24 HS (12 - 24 HS)',
            val: `${cirugiasStats.de12a24h || 0} cirugías`,
            sub: `${cirugiasStats.de12a24hPct || '0'}% primer día internación`,
            borderColor: [2, 132, 199], // Celeste Océano
            textColor: [3, 105, 161]
        },
        {
            title: 'ESTABILIZACIÓN (24 - 48 HS)',
            val: `${cirugiasStats.de24a48h || 0} cirugías`,
            sub: `${cirugiasStats.de24a48hPct || '0'}% estabilización previa`,
            borderColor: [217, 119, 6], // Ámbar
            textColor: [180, 83, 9]
        },
        {
            title: 'PROCEDIMIENTO MÁS FRECUENTE',
            val: (cirugiasStats.topProcedimientos?.[0]?.nombre || 'Sin datos').substring(0, 22),
            sub: `${cirugiasStats.topProcedimientos?.[0]?.cantidad || 0} casos (${cirugiasStats.topProcedimientos?.[0]?.pct || '0'}%)`,
            borderColor: [99, 102, 241], // Índigo
            textColor: [67, 56, 202]
        }
    ];

    const cardW = (contentW - 8) / 5;
    const cardH = 14;

    kpiCards.forEach((c, idx) => {
        const cX = margin + idx * (cardW + 2);
        // Fondo blanco
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(cX, y, cardW, cardH, 2, 2, 'F');
        // Borde fino
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(cX, y, cardW, cardH, 2, 2, 'S');
        // Tira superior de color
        doc.setFillColor(...c.borderColor);
        doc.rect(cX, y, cardW, 1.2, 'F');

        // Título de la tarjeta
        doc.setFontSize(5.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(100, 116, 139);
        doc.text(c.title, cX + 3, y + 4.5);

        // Valor principal
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...c.textColor);
        doc.text(c.val, cX + 3, y + 9);

        // Subtítulo
        doc.setFontSize(5.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(148, 163, 184);
        doc.text(c.sub, cX + 3, y + 12.5);
    });

    y += cardH + 4;

    // 4. Tabla Principal (autoTable)
    const tableHeaders = [
        'N°',
        'Paciente & DNI',
        'NHC',
        'Obra Social',
        'Llegada Guardia',
        'Cirugía / Procedimiento Derivado',
        'Especialidad & Cirujano',
        'Fecha & Hora Qx',
        'Espera a Qx',
        'Estado'
    ];

    const tableRows = records.map((r, i) => {
        const pacienteCell = `${r.paciente || 'PACIENTE'}\nDNI: ${r.dni || '-'}`;
        const llegadaCell = `${r.fecha_guardia || '-'}\n${r.hora_guardia ? r.hora_guardia.substring(0, 5) : '-'}`;
        const especialidadCell = `${r.especialidad || 'CIRUGIA'}\n${r.cirujano || 'Sin Asignar'}`;
        const qxCell = `${r.fecha_cirugia || '-'}\n${r.hora_cirugia ? r.hora_cirugia.substring(0, 5) : '-'}`;
        
        const hs = r.horas_espera_qx != null ? Number(r.horas_espera_qx) : null;
        let esperaTexto = '-';
        if (hs != null) {
            const etiqueta = hs <= 6 ? 'Inmediata' : hs <= 12 ? 'Urgente' : hs <= 24 ? '12 - 24 hs' : '24 - 48 hs';
            esperaTexto = `${hs} hs\n${etiqueta}`;
        }

        return [
            i + 1,
            pacienteCell,
            r.nhc || '-',
            (r.obra_social || '-').substring(0, 22),
            llegadaCell,
            (r.cirugia_procedimiento || '-').substring(0, 48),
            especialidadCell,
            qxCell,
            esperaTexto,
            r.estado_cirugia || 'Realizada'
        ];
    });

    autoTable(doc, {
        startY: y,
        head: [tableHeaders],
        body: tableRows,
        margin: { left: margin, right: margin, bottom: 14 },
        theme: 'grid',
        headStyles: {
            fillColor: [13, 59, 102], // Navy Institucional
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 7,
            halign: 'center',
            valign: 'middle'
        },
        bodyStyles: {
            fontSize: 6.5,
            textColor: [30, 41, 59],
            valign: 'middle',
            cellPadding: 2
        },
        alternateRowStyles: {
            fillColor: [248, 250, 252]
        },
        columnStyles: {
            0: { cellWidth: 8, halign: 'center', fontStyle: 'bold', textColor: [148, 163, 184] },
            1: { cellWidth: 42, fontStyle: 'bold', textColor: [15, 23, 42] },
            2: { cellWidth: 15, halign: 'center', fontStyle: 'bold', textColor: [71, 85, 105] },
            3: { cellWidth: 30, textColor: [51, 65, 85] },
            4: { cellWidth: 24, halign: 'center', textColor: [51, 65, 85] },
            5: { cellWidth: 54, fontStyle: 'bold', textColor: [30, 58, 138] },
            6: { cellWidth: 38, textColor: [4, 120, 87] },
            7: { cellWidth: 24, halign: 'center', textColor: [51, 65, 85] },
            8: { cellWidth: 18, halign: 'center', fontStyle: 'bold', textColor: [30, 64, 175] },
            9: { cellWidth: 16, halign: 'center', fontStyle: 'bold', textColor: [15, 23, 42] }
        },
        styles: {
            lineColor: [226, 232, 240],
            lineWidth: 0.15,
            overflow: 'linebreak'
        }
    });

    // 5. Aplicar footer institucional con paginación en todas las hojas
    applyFootersLandscape(doc);

    // 6. Descarga directa
    const cleanPeriodo = (periodo || '2026').replace(/[^a-zA-Z0-9]/g, '_');
    const fileName = `Informe_Cirugias_Guardia_Asociaciones_${cleanPeriodo}_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);
    return fileName;
}
