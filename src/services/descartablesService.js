/**
 * descartablesService.js — Servicio de Módulos de Descartables Quirúrgicos
 * 
 * Basado en el análisis de consumo real histórico de Quirófano (2024–2026)
 * de Sanatorio Argentino SRL (TABLEAU_Consumos Cirugías).
 * Provee:
 *  - Carga y consulta de las Top 50 cirugías y sus recetas de descartables
 *  - Matching difuso / inteligente para identificar la cirugía desde la agenda
 *  - Generador de PDF institucional con el formato idéntico al de Asociaciones (ITYS / SGC)
 */

import modulosData from '../data/modulos_descartables_top50.json';

/**
 * Retorna el catálogo completo del Top 50 cirugías con sus módulos de descartables
 */
export function getTop50Modulos() {
    return modulosData || [];
}

/**
 * Normaliza una cadena para comparación robusta (remueve tildes, prefijo CX, puntuación)
 */
export function normalizeSurgeryName(name) {
    if (!name) return '';
    return name
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/\bCX\b|\(|\)/gi, '')
        .replace(/[^A-Z0-9\s]/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toUpperCase();
}

/**
 * Encuentra el mejor módulo coincidente para una cirugía dada (por descripción o módulo)
 * @param {string} surgeryDescription 
 * @param {string} surgeryModulo 
 * @returns {{ modulo: Object, score: number, type: string } | null}
 */
export function findBestMatchModulo(surgeryDescription, surgeryModulo = '') {
    const list = getTop50Modulos();
    if (!list || list.length === 0) return null;

    const candidates = [surgeryDescription, surgeryModulo].filter(Boolean);
    if (candidates.length === 0) return null;

    for (const text of candidates) {
        const cInput = normalizeSurgeryName(text);
        if (!cInput) continue;

        // 1. Coincidencia exacta limpia
        const exact = list.find(m => normalizeSurgeryName(m.nombre_cirugia) === cInput);
        if (exact) return { modulo: exact, score: 1.0, type: 'exact' };

        // 2. Coincidencia por contención (substring)
        const contains = list.find(m => {
            const cMod = normalizeSurgeryName(m.nombre_cirugia);
            return cInput.includes(cMod) || cMod.includes(cInput);
        });
        if (contains) return { modulo: contains, score: 0.9, type: 'contains' };

        // 3. Coincidencia por solapamiento de palabras clave (Jaccard)
        const inputTokens = new Set(cInput.split(' ').filter(t => t.length > 2));
        let best = null;
        let maxScore = 0;

        for (const m of list) {
            const modTokens = new Set(normalizeSurgeryName(m.nombre_cirugia).split(' ').filter(t => t.length > 2));
            let common = 0;
            for (const t of inputTokens) {
                if (modTokens.has(t)) common++;
            }
            const score = common / Math.max(inputTokens.size, modTokens.size);
            if (score > maxScore && score >= 0.4) {
                maxScore = score;
                best = m;
            }
        }

        if (best) return { modulo: best, score: maxScore, type: 'tokens' };
    }

    return null;
}

/**
 * Formatea moneda en pesos argentinos
 */
export function formatCurrency(amount) {
    if (amount === undefined || amount === null || isNaN(amount)) return '$ 0';
    return '$ ' + Number(amount).toLocaleString('es-AR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

/**
 * Genera y descarga el PDF institucional del Módulo de Descartables
 * Sigue estrictamente la estética oficial de "Asociaciones" (Sanatorio Argentino):
 *  - Header azul marino #0D3B66 con línea de acento #3B82F6
 *  - Logo circular institucional vía canvas
 *  - Barra de metadatos redondeada
 *  - Tabla estructurada con autoTable en grid limpio
 *  - Bloques de totales y firmas institucionales
 */
export async function generateDescartablesPDF({ surgery, modulo, patient = {}, currentUser = null, mode = 'moda' }) {
    if (!modulo) throw new Error('No se ha especificado un módulo para generar el PDF.');

    const { default: jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');

    const doc = new jsPDF();
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 14;
    const colW = pageW - margin * 2;
    let y = 0;

    // 1. Cargar imagen de logo y recortar en círculo mediante canvas
    let logoCircleBase64 = null;
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
        logoCircleBase64 = canvas.toDataURL('image/png');
    } catch (_) {
        // Logo opcional si no carga en el browser
    }

    // ═══════════════════════════════════════════
    //  HEADER — Barra azul institucional (#0D3B66)
    // ═══════════════════════════════════════════
    doc.setFillColor(13, 59, 102); // #0D3B66
    doc.rect(0, 0, pageW, 34, 'F');

    // Logo circular
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

    // Título Principal
    doc.setFontSize(16);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.text('SANATORIO ARGENTINO', margin + 18, 14);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(180, 200, 220);
    doc.text('Administración · Quirófanos y Gestión de Descartables', margin + 18, 21);

    // Badge superior derecho
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('MÓDULO DE DESCARTABLES', pageW - margin, 14, { align: 'right' });
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(180, 200, 220);
    doc.text('Sistema ADM-QUI', pageW - margin, 21, { align: 'right' });

    // Línea de acento institucional (#3B82F6)
    doc.setFillColor(59, 130, 246);
    doc.rect(0, 34, pageW, 2, 'F');

    y = 44;

    // ═══════════════════════════════════════════
    //  INFO BAR — Tarjeta de Metadatos
    // ═══════════════════════════════════════════
    const pacienteNombre = surgery?.nombre || patient?.nombre || 'PACIENTE NO ESPECIFICADO';
    const pacienteDni = patient?.dni || surgery?.dni || '—';
    const fechaCirugiaStr = surgery?.fecha_cirugia 
        ? new Date(surgery.fecha_cirugia + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
        : new Date().toLocaleDateString('es-AR');

    const totalCostoElegido = mode === 'promedio' 
        ? modulo.costo_total_estimado_promedio 
        : modulo.costo_total_estimado_moda;

    doc.setFillColor(241, 245, 249); // #F1F5F9
    doc.roundedRect(margin, y, colW, 20, 3, 3, 'F');
    doc.setDrawColor(226, 232, 240); // #E2E8F0
    doc.roundedRect(margin, y, colW, 20, 3, 3, 'S');

    const infoItems = [
        { label: 'PACIENTE', value: pacienteNombre.length > 24 ? pacienteNombre.substring(0, 22) + '...' : pacienteNombre, sub: `DNI: ${pacienteDni}` },
        { label: 'CIRUGÍA / PROCEDIMIENTO', value: modulo.nombre_cirugia.length > 32 ? modulo.nombre_cirugia.substring(0, 30) + '...' : modulo.nombre_cirugia, sub: `Ranking Top: #${modulo.ranking}` },
        { label: 'FECHA CIRUGÍA', value: fechaCirugiaStr, sub: `Muestra: ${modulo.casos_analizados} casos` },
        { label: 'COSTO ESTIMADO (' + mode.toUpperCase() + ')', value: formatCurrency(totalCostoElegido), sub: `Venta: ${formatCurrency(mode === 'promedio' ? modulo.precio_venta_total_promedio : modulo.precio_venta_total_moda)}` }
    ];

    const cellW = colW / 4;
    infoItems.forEach((item, i) => {
        const x = margin + cellW * i + 5;
        doc.setFontSize(6);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(148, 163, 184);
        doc.text(item.label, x, y + 5.5);

        doc.setFontSize(i === 3 ? 10.5 : 8.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(13, 59, 102);
        doc.text(item.value || '—', x, y + 11.5);

        if (item.sub) {
            doc.setFontSize(6.5);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(100, 116, 139);
            doc.text(item.sub, x, y + 16.5);
        }
    });

    y += 28;

    // ═══════════════════════════════════════════
    //  SECTION TITLE — Detalle de Descartables
    // ═══════════════════════════════════════════
    doc.setFillColor(59, 130, 246);
    doc.rect(margin, y, 3, 7, 'F');
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(13, 59, 102);
    doc.text('DETALLE DE DESCARTABLES DEL MÓDULO', margin + 6, y + 5.5);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(`Insumos base con frecuencia ≥ 25% calculados en base a ${modulo.casos_analizados} cirugías realizadas`, margin + 82, y + 5.5);

    y += 12;

    // ═══════════════════════════════════════════
    //  TABLE — Descartables (autoTable)
    // ═══════════════════════════════════════════
    // Filtramos los descartables que forman parte del módulo base
    const descartablesBase = (modulo.descartables || []).filter(d => d.es_modulo_base);
    const tableBody = descartablesBase.map((d, idx) => {
        const costoSubtotal = mode === 'promedio' ? d.costo_subtotal_promedio : d.costo_subtotal_moda;
        return [
            String(idx + 1),
            d.concepto || '—',
            `${d.frecuencia_uso_pct}%`,
            String(d.cantidad_moda),
            String(d.cantidad_promedio),
            formatCurrency(d.costo_unitario),
            formatCurrency(costoSubtotal)
        ];
    });

    autoTable(doc, {
        startY: y,
        head: [['#', 'Insumo / Concepto Descartable', 'Frecuencia', 'Cant. Moda', 'Cant. Prom.', 'Costo Unit.', 'Subtotal Costo']],
        body: tableBody,
        theme: 'grid',
        headStyles: {
            fillColor: [13, 59, 102], // #0D3B66
            textColor: [255, 255, 255],
            fontSize: 7.5,
            fontStyle: 'bold',
            halign: 'left',
            cellPadding: 3,
        },
        bodyStyles: {
            fontSize: 7.5,
            cellPadding: 2.5,
            textColor: [30, 30, 30],
        },
        alternateRowStyles: {
            fillColor: [248, 250, 252], // #F8FAFC
        },
        columnStyles: {
            0: { cellWidth: 8, halign: 'center', fontStyle: 'bold', textColor: [148, 163, 184] },
            1: { cellWidth: 74, fontStyle: 'bold' },
            2: { cellWidth: 20, halign: 'center', textColor: [37, 99, 235] },
            3: { cellWidth: 18, halign: 'center', fontStyle: mode === 'moda' ? 'bold' : 'normal', textColor: mode === 'moda' ? [15, 23, 42] : [100, 116, 139] },
            4: { cellWidth: 18, halign: 'center', fontStyle: mode === 'promedio' ? 'bold' : 'normal', textColor: mode === 'promedio' ? [15, 23, 42] : [100, 116, 139] },
            5: { cellWidth: 22, halign: 'right' },
            6: { cellWidth: 22, halign: 'right', fontStyle: 'bold', textColor: [13, 59, 102] },
        },
        margin: { left: margin, right: margin },
        didDrawPage: () => {
            // Re-draw minimal header on subsequent pages
            doc.setFillColor(13, 59, 102);
            doc.rect(0, 0, pageW, 8, 'F');
            doc.setFillColor(59, 130, 246);
            doc.rect(0, 8, pageW, 1, 'F');
        },
    });

    y = doc.lastAutoTable.finalY + 6;

    // ═══════════════════════════════════════════
    //  TOTALS & AUDIT SUMMARY BOX
    // ═══════════════════════════════════════════
    if (y > pageH - 75) {
        doc.addPage();
        y = 20;
    }

    doc.setFillColor(248, 250, 252); // #F8FAFC
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(margin, y, colW, 22, 2, 2, 'FD');

    // Totales comparativos
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(13, 59, 102);
    doc.text(`TOTALES DEL MÓDULO (${descartablesBase.length} artículos base):`, margin + 5, y + 6.5);

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(`Costo Total Estimado (Moda - Caso Habitual):`, margin + 5, y + 12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(formatCurrency(modulo.costo_total_estimado_moda), margin + 65, y + 12);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(`Costo Total Estimado (Promedio Continuo):`, margin + 5, y + 17.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(formatCurrency(modulo.costo_total_estimado_promedio), margin + 65, y + 17.5);

    // Columna derecha del box: Precio de venta
    const col2X = margin + colW / 2 + 10;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(`Precio de Venta Sugerido (Moda):`, col2X, y + 12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(37, 99, 235);
    doc.text(formatCurrency(modulo.precio_venta_total_moda), col2X + 50, y + 12);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(`Precio de Venta Sugerido (Promedio):`, col2X, y + 17.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(37, 99, 235);
    doc.text(formatCurrency(modulo.precio_venta_total_promedio), col2X + 50, y + 17.5);

    y += 30;

    // ═══════════════════════════════════════════
    //  FIRMAS INSTITUCIONALES (Igual que Asociaciones)
    // ═══════════════════════════════════════════
    if (y > pageH - 65) {
        doc.addPage();
        y = 20;
    }

    const sigBoxW = (colW - 20) / 2;

    // Firma Quirófano
    const sig1X = margin;
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(sig1X, y, sigBoxW, 36, 3, 3, 'S');
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(148, 163, 184);
    doc.text('VALIDACIÓN TÉCNICA / QUIRÓFANO', sig1X + sigBoxW / 2, y + 6, { align: 'center' });

    doc.setDrawColor(13, 59, 102);
    doc.setLineWidth(0.5);
    doc.line(sig1X + 12, y + 25, sig1X + sigBoxW - 12, y + 25);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(13, 59, 102);
    doc.text('Supervisión de Quirófano / Farmacia', sig1X + sigBoxW / 2, y + 29.5, { align: 'center' });
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text('Sanatorio Argentino SRL', sig1X + sigBoxW / 2, y + 33.5, { align: 'center' });

    // Firma Administración
    const sig2X = margin + sigBoxW + 20;
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(sig2X, y, sigBoxW, 36, 3, 3, 'S');
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(148, 163, 184);
    doc.text('AUDITORÍA / PRESUPUESTOS Y COTIZACIONES', sig2X + sigBoxW / 2, y + 6, { align: 'center' });

    doc.setDrawColor(13, 59, 102);
    doc.line(sig2X + 12, y + 25, sig2X + sigBoxW - 12, y + 25);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(13, 59, 102);
    const responsableNombre = currentUser?.nombre || currentUser?.username || 'Responsable de Presupuestos';
    doc.text(responsableNombre, sig2X + sigBoxW / 2, y + 29.5, { align: 'center' });
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text('Administración y Liquidaciones', sig2X + sigBoxW / 2, y + 33.5, { align: 'center' });

    // ═══════════════════════════════════════════
    //  FOOTER — Todas las páginas
    // ═══════════════════════════════════════════
    const totalPages = doc.internal.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        doc.setDrawColor(226, 232, 240);
        doc.line(margin, pageH - 12, pageW - margin, pageH - 12);

        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(148, 163, 184);
        doc.text('Sanatorio Argentino SRL — Sistema ADM-QUI · Módulo de Descartables Quirúrgicos (Estándar SGC/ITAES)', margin, pageH - 7);

        const fechaEmision = new Date().toLocaleString('es-AR', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
        doc.text(`Emitido: ${fechaEmision} | Página ${p} de ${totalPages}`, pageW - margin, pageH - 7, { align: 'right' });
    }

    // Descarga del PDF con nombre sanitizado
    const cleanCirugia = modulo.nombre_cirugia.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
    const cleanPaciente = pacienteNombre.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20);
    const fileName = `modulo_descartables_${cleanCirugia}_${cleanPaciente}.pdf`;
    doc.save(fileName);
    return fileName;
}
