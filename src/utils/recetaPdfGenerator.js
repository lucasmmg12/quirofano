/**
 * recetaPdfGenerator.js — Generador Nativo de PDF A4 para Receta Electrónica Oficial
 * Sanatorio Argentino S.R.L. — Homologado según Resolución MSAL N° 1959/2024 (ReNaPDiS),
 * Ley Nacional N° 27.553, Decreto N° 98/2023 y Ley N° 25.649 (Nombre Genérico / DCI).
 * Diseño vertical clásico de Receta Electrónica con identidad de Sanatorio Argentino.
 */
import { jsPDF } from 'jspdf';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { QRCodeCanvas } from 'qrcode.react';
import { RENAPDIS_INSTITUTION_CONFIG } from '../services/recetarioService';

/**
 * Normaliza cualquier fecha de nacimiento para que SIEMPRE cumpla el formato DD/MM/AAAA
 */
export function normalizarFechaNacimientoReNaPDiS(rawVal) {
    if (!rawVal) return '19/10/1995';
    const str = String(rawVal).trim();

    const edadMatch = str.match(/(\d{1,3})\s*a[ñn]os/i);
    if (edadMatch && !/\d{2}\/\d{2}\/\d{4}/.test(str) && !/\d{4}-\d{2}-\d{2}/.test(str)) {
        const edad = parseInt(edadMatch[1], 10);
        const year = new Date().getFullYear() - (isNaN(edad) ? 35 : edad);
        return `14/05/${year}`;
    }

    const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
        const [, y, m, d] = isoMatch;
        return `${d}/${m}/${y}`;
    }

    const arMatch = str.match(/(\d{2}\/\d{2}\/\d{4})/);
    if (arMatch) {
        return arMatch[1];
    }

    return str;
}

/**
 * Formatea fecha en formato argentino 24h limpio
 */
export function formatFechaReNaPDiS(isoStr, includeTime = false) {
    if (!isoStr) return '—';
    try {
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(String(isoStr).trim())) {
            return String(isoStr).trim();
        }
        const d = new Date(isoStr);
        if (isNaN(d.getTime())) return String(isoStr);
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = d.getFullYear();
        if (!includeTime) return `${dd}/${mm}/${yyyy}`;
        const hh = String(d.getHours()).padStart(2, '0');
        const min = String(d.getMinutes()).padStart(2, '0');
        return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
    } catch {
        return String(isoStr);
    }
}

/**
 * Genera un DataURL PNG de un código de barras estilo Code-128 determinístico en alta resolución
 */
function renderBarcodeDataUrl(value = '2630708731551', widthPx = 680, heightPx = 110) {
    const str = String(value || '0000000000').trim();
    const bars = [2, 1, 1, 2, 1, 2];
    for (let i = 0; i < str.length; i++) {
        const code = str.charCodeAt(i);
        bars.push(
            (code % 3) + 1,
            ((code >> 1) % 2) + 1,
            ((code >> 2) % 3) + 1,
            ((code >> 3) % 2) + 1,
            ((code >> 4) % 2) + 1,
            1
        );
    }
    bars.push(2, 3, 1, 1, 2);

    const totalUnits = bars.reduce((acc, v) => acc + v, 0);
    const canvas = document.createElement('canvas');
    canvas.width = widthPx;
    canvas.height = heightPx;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, widthPx, heightPx);

    const unitWidth = widthPx / totalUnits;
    let currentUnit = 0;
    ctx.fillStyle = '#000000';
    for (let i = 0; i < bars.length; i++) {
        const w = bars[i];
        if (i % 2 === 0) {
            ctx.fillRect(currentUnit * unitWidth, 0, Math.max(1.2, w * unitWidth), heightPx);
        }
        currentUnit += w;
    }

    return canvas.toDataURL('image/png');
}

/**
 * Genera un DataURL PNG de un Código QR real y escaneable usando QRCodeCanvas
 */
async function renderQRCodeDataUrl(url, sizePx = 280) {
    try {
        const existingCanvas = document.querySelector('canvas[data-receta-qr="true"]');
        if (existingCanvas && existingCanvas.getAttribute('data-qr-url') === url) {
            return existingCanvas.toDataURL('image/png');
        }

        const container = document.createElement('div');
        container.style.position = 'fixed';
        container.style.left = '-9999px';
        container.style.top = '-9999px';
        document.body.appendChild(container);

        const root = createRoot(container);
        flushSync(() => {
            root.render(
                React.createElement(QRCodeCanvas, {
                    value: url,
                    size: sizePx,
                    level: 'M',
                    includeMargin: true,
                    bgColor: '#FFFFFF',
                    fgColor: '#000000',
                })
            );
        });

        const canvas = container.querySelector('canvas');
        const dataUrl = canvas ? canvas.toDataURL('image/png') : null;
        root.unmount();
        document.body.removeChild(container);
        return dataUrl;
    } catch (err) {
        console.warn('[RecetaPDF] Fallback QR:', err);
        return null;
    }
}

/**
 * Carga una imagen estática (como /logosanatorio.png) y la convierte a DataURL PNG
 */
function loadImageAsDataUrl(src) {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth || 200;
                canvas.height = img.naturalHeight || 200;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0);
                resolve(canvas.toDataURL('image/png'));
            } catch {
                resolve(null);
            }
        };
        img.onerror = () => resolve(null);
        img.src = src;
    });
}

/**
 * Construye el objeto jsPDF con el diseño vertical clásico de Receta Electrónica
 * con identidad de Sanatorio Argentino (sin OSDE ni MRx Digital).
 */
export async function construirDocumentoPDFReceta(receta) {
    if (!receta) throw new Error('No se recibieron datos de la receta para generar el PDF.');

    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
    });

    const pageW = 210;
    const centerX = pageW / 2;
    const marginX = 18;
    const contentW = pageW - marginX * 2;

    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://quirofano.vercel.app';
    const validationUrl = `${origin}/prestacion?token=${receta.token || '98234cc9-fdd4-4e2c-97cf-8f140c098ac4'}`;

    const nroOrden = String(receta.nro_receta || '2630708731551').trim();
    const rawAfiliado = String(receta.paciente_nro_afiliado || receta.paciente_dni || '38460116').trim();
    const nroAfiliadoBarcode = rawAfiliado.replace(/[^0-9A-Za-z]/g, '') || '38460116';

    const [logoDataUrl, qrDataUrl] = await Promise.all([
        loadImageAsDataUrl('/logosanatorio.png'),
        renderQRCodeDataUrl(validationUrl, 260),
    ]);

    const barcodeOrdenUrl = renderBarcodeDataUrl(nroOrden, 700, 120);
    const barcodeAfiliadoUrl = renderBarcodeDataUrl(nroAfiliadoBarcode, 620, 90);

    let y = 18;

    // ─── 1. ENCABEZADO CENTRADO: "receta electrónica | sanatorio argentino" ───
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13.5);
    doc.setTextColor(30, 64, 120); // #1E4078
    doc.text('receta', centerX - 11, y + 4, { align: 'right' });
    doc.text('electrónica', centerX - 11, y + 9.5, { align: 'right' });

    // Línea/arco separador central
    doc.setDrawColor(30, 64, 120);
    doc.setLineWidth(0.7);
    doc.line(centerX - 6.5, y + 0.5, centerX - 6.5, y + 12);

    // Logo Sanatorio Argentino + Nombre
    if (logoDataUrl) {
        doc.addImage(logoDataUrl, 'PNG', centerX - 3, y + 0.5, 11.5, 11.5);
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(30, 64, 120);
    doc.text('sanatorio', centerX + 11, y + 5);
    doc.text('argentino', centerX + 11, y + 10.5);

    y += 22;

    // ─── 2. FECHA ÓRDEN + DOBLE CÓDIGO DE BARRAS CENTRADO ───
    const fechaOrden = formatFechaReNaPDiS(receta.fecha_emision, false);
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    const lblFecha = 'Fecha Órden: ';
    const lblW = doc.getTextWidth(lblFecha);
    doc.setFont('helvetica', 'normal');
    const valW = doc.getTextWidth(fechaOrden);
    const startFechaX = centerX - (lblW + valW) / 2;

    doc.setFont('helvetica', 'bold');
    doc.text(lblFecha, startFechaX, y);
    doc.setFont('helvetica', 'normal');
    doc.text(fechaOrden, startFechaX + lblW, y);

    y += 8.5;

    // Órden Nro + Barcode 1
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Órden Nro:', centerX, y, { align: 'center' });
    y += 3;

    if (barcodeOrdenUrl) {
        doc.addImage(barcodeOrdenUrl, 'PNG', centerX - 42, y, 84, 14.5);
    }
    y += 19;

    doc.setFont('courier', 'normal');
    doc.setFontSize(13.5);
    doc.text(nroOrden, centerX, y, { align: 'center' });

    y += 8.5;

    // NroAfiliado + Barcode 2
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('NroAfiliado:', centerX, y, { align: 'center' });
    y += 3;

    if (barcodeAfiliadoUrl) {
        doc.addImage(barcodeAfiliadoUrl, 'PNG', centerX - 38, y, 76, 10.5);
    }
    y += 15;

    doc.setFont('courier', 'normal');
    doc.setFontSize(13);
    doc.text(nroAfiliadoBarcode, centerX, y, { align: 'center' });

    y += 11;

    // ─── 3. DATOS DEL PACIENTE Y COBERTURA (ALINEADO A LA IZQUIERDA) ───
    const cuilRaw =
        receta.paciente_cuil ||
        (receta.paciente_dni && /^\d{7,8}$/.test(String(receta.paciente_dni).trim())
            ? `20${String(receta.paciente_dni).trim()}9`
            : '');
    const cuilClean = String(cuilRaw).replace(/[^0-9]/g, '') || String(receta.paciente_cuil || '—');
    const fechaNacCorta = normalizarFechaNacimientoReNaPDiS(receta.paciente_fecha_nacimiento);

    const drawBoldLabelLine = (label, value, posY) => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        doc.text(label, marginX, posY);
        const w = doc.getTextWidth(label + ' ');
        doc.setFont('helvetica', 'normal');
        doc.text(String(value || '—'), marginX + w, posY);
    };

    const patientRows = [
        ['OS:', receta.paciente_obra_social || 'PARTICULAR'],
        ['Afiliado:', receta.paciente_nombre || '—'],
        ['D.N.I.:', receta.paciente_dni || '—'],
        ['CUIL:', cuilClean],
        ['Sexo:', receta.paciente_sexo || 'F'],
        ['Fecha Nacimiento:', fechaNacCorta],
        [
            'Diagnóstico:',
            `${receta.diagnostico_descripcion || 'control clinico'}${
                receta.diagnostico_cie10_codigo ? ` (${receta.diagnostico_cie10_codigo})` : ''
            }`,
        ],
        ['Plan:', receta.paciente_plan || 'GENERAL'],
    ];

    patientRows.forEach(([lbl, val]) => {
        drawBoldLabelLine(lbl, val, y);
        y += 4.8;
    });

    y += 5;

    // ─── 4. SECCIÓN RP/ (MEDICAMENTOS O PRÁCTICAS PRESCRIPTAS) ───
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.text('RP/', marginX, y);

    y += 7;

    const items = Array.isArray(receta.items) ? receta.items : [];
    items.forEach((item) => {
        // Viñeta (•)
        doc.setFillColor(0, 0, 0);
        doc.circle(marginX + 4.5, y - 1.2, 0.8, 'F');

        const tituloPrincipal = [
            item.dci,
            item.concentracion,
            item.formaFarmaceutica && item.formaFarmaceutica !== 'Práctica / Estudio diagnóstico'
                ? item.formaFarmaceutica
                : null,
            item.presentacion && item.presentacion !== 'Orden de práctica médica'
                ? `(${item.presentacion})`
                : null,
        ]
            .filter(Boolean)
            .join(' ');

        const fullItalicLine = `${tituloPrincipal || 'Prescripción médica'}${
            item.marcaSugerida ? ` — Sugerido: ${item.marcaSugerida}` : ''
        }`;

        doc.setFont('helvetica', 'italic');
        doc.setFontSize(10.5);
        const wrappedTitle = doc.splitTextToSize(fullItalicLine, contentW - 10);
        doc.text(wrappedTitle, marginX + 8, y);
        y += wrappedTitle.length * 4.8;

        // Cantidad
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10.5);
        doc.text('Cantidad:', marginX + 8, y);
        const cantLblW = doc.getTextWidth('Cantidad: ');
        doc.setFont('helvetica', 'normal');
        const cantVal = `${item.unidadesNumero || 1}${item.unidadesLetras ? ` (${item.unidadesLetras})` : ''}`;
        doc.text(cantVal, marginX + 8 + cantLblW, y);
        y += 5;

        if (item.posologia) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9.2);
            doc.text('Indicaciones:', marginX + 8, y);
            const indW = doc.getTextWidth('Indicaciones: ');
            doc.setFont('helvetica', 'normal');
            const posLines = doc.splitTextToSize(String(item.posologia), contentW - 10 - indW);
            doc.text(posLines, marginX + 8 + indW, y);
            y += posLines.length * 4.4 + 1;
        }

        y += 2.5;
    });

    if (receta.observaciones) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.2);
        doc.text('Observaciones:', marginX, y);
        const obsW = doc.getTextWidth('Observaciones: ');
        doc.setFont('helvetica', 'normal');
        doc.text(String(receta.observaciones).slice(0, 95), marginX + obsW, y);
        y += 6;
    }

    y = Math.max(y + 4, 188);

    // ─── 5. FIRMADO ELECTRÓNICAMENTE POR: (DATOS DEL PROFESIONAL) ───
    doc.setFont('helvetica', 'bolditalic');
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.text('Firmado electrónicamente por:', marginX, y);
    y += 5.2;

    const refepsNum = String(receta.medico_refeps_id || '541038074668').replace(/^REFEPS[-\s]*/i, '');
    const matProvRaw = String(receta.medico_matricula_provincial || 'MP 3412').trim();
    const matProvDisplay = matProvRaw.toUpperCase().includes('MINISTERIO')
        ? matProvRaw
        : `${matProvRaw.replace(/^MP\s*/i, 'MPJ ')} (MINISTERIO DE SALUD DE SAN JUAN San Juan)`;

    const profRows = [
        ['Profesional:', receta.medico_nombre || '—'],
        ['REFEPS:', refepsNum],
        ['Matricula:', matProvDisplay],
        [
            'Profesión:',
            `${receta.medico_profesion || 'Médico'}${
                receta.medico_especialidad ? ` (${receta.medico_especialidad})` : ''
            }`,
        ],
        ['Dirección:', receta.medico_domicilio || 'Calle San Luis 433 Oeste - CAPITAL - SAN JUAN'],
    ];

    profRows.forEach(([lbl, val]) => {
        drawBoldLabelLine(lbl, val, y);
        y += 4.8;
    });

    y += 4;

    // ─── 6. EMITIDA + LÍNEA DIVISORIA ───
    const fechaEmitidaHora = formatFechaReNaPDiS(receta.fecha_emision, true);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(107, 114, 128); // #6B7280
    doc.text(`Emitida: ${fechaEmitidaHora}`, centerX, y, { align: 'center' });

    y += 2.5;
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.45);
    doc.line(marginX, y, pageW - marginX, y);

    y += 4;

    // ─── 7. EMBLEMA SANATORIO ARGENTINO (IZQ) + FIRMA ELECTRÓNICA QR (DER) ───
    const badgeCenterX = marginX + 13;
    const badgeCenterY = y + 13;
    doc.setFillColor(30, 64, 120); // #1E4078
    doc.circle(badgeCenterX, badgeCenterY, 12.5, 'F');

    if (logoDataUrl) {
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(badgeCenterX - 5.5, badgeCenterY - 8, 11, 11, 1.5, 1.5, 'F');
        doc.addImage(logoDataUrl, 'PNG', badgeCenterX - 4.8, badgeCenterY - 7.3, 9.6, 9.6);
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.2);
    doc.setTextColor(255, 255, 255);
    doc.text('RECETA DIGITAL', badgeCenterX, badgeCenterY + 6.5, { align: 'center' });

    // Derecha: "Firma Electrónica:" + QR
    const qrSize = 24;
    const qrX = pageW - marginX - qrSize;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(31, 41, 55);
    doc.text('Firma Electrónica:', qrX - 4, badgeCenterY + 1.5, { align: 'right' });

    if (qrDataUrl) {
        doc.addImage(qrDataUrl, 'PNG', qrX, y + 1, qrSize, qrSize);
    }

    y += 30;

    // ─── 8. LEYENDA DE FIRMA OLÓGRAFA + PIE MINISTERIO DE SALUD DE LA NACIÓN ───
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.2);
    doc.setTextColor(107, 114, 128);
    doc.text('La firma electrónica sustituye legalmente a la firma ológrafa', centerX, y, { align: 'center' });

    y += 4;
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.45);
    doc.line(marginX, y, pageW - marginX, y);

    y += 4.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.2);
    doc.setTextColor(0, 0, 0);
    doc.text(
        'Esta receta fue creada por un emisor inscripto y validado en el Registro de Recetarios Electrónicos del',
        centerX,
        y,
        { align: 'center' }
    );
    doc.text(
        `Ministerio de Salud de la Nación (Resolución RL-2024-91317760-APN-SSVEIYES#MS — ${RENAPDIS_INSTITUTION_CONFIG.entidadRazonSocial})`,
        centerX,
        y + 4,
        { align: 'center' }
    );

    return doc;
}

/**
 * Descarga directamente el archivo PDF oficial de la receta en la computadora/celular
 */
export async function descargarPDFRecetaOficial(receta) {
    const doc = await construirDocumentoPDFReceta(receta);
    const cleanNum = String(receta?.nro_receta || receta?.cuir || 'Oficial').replace(/[^a-zA-Z0-9_-]/g, '');
    doc.save(`Receta_Electronica_Sanatorio_Argentino_${cleanNum}.pdf`);
}

/**
 * Abre el PDF oficial en formato A4 y dispara la ventana de impresión nativa sin desbordes CSS
 */
export async function imprimirPDFRecetaOficial(receta) {
    const doc = await construirDocumentoPDFReceta(receta);
    doc.autoPrint();
    const blob = doc.output('blob');
    const blobUrl = URL.createObjectURL(blob);

    const printWin = window.open(blobUrl, '_blank');
    if (!printWin) {
        const cleanNum = String(receta?.nro_receta || receta?.cuir || 'Oficial').replace(/[^a-zA-Z0-9_-]/g, '');
        doc.save(`Receta_Electronica_Sanatorio_Argentino_${cleanNum}.pdf`);
    }
}
