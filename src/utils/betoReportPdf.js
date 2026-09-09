/**
 * betoReportPdf.js — Genera PDFs y Excels oficiales desde los reportes de Beto IA
 * 
 * Estética idéntica a la Constancia de Asociaciones del Sanatorio Argentino:
 * - Header oficial azul institucional (#0D3B66) con línea de acento (#3B82F6)
 * - Logo circular institucional del Sanatorio Argentino
 * - Tipografía Montserrat (con fallback automático a Helvetica)
 * - Sanitización estricta de emojis y caracteres que rompen jsPDF (adiós a Ø<ßå)
 * - Info Bar de metadatos clínicos y tablas autoTable estilizadas
 * - Generador de Excel (.xlsx) nativo complementario
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ─── Color palette (Estándar Institucional Asociaciones — Sanatorio Argentino) ───
const COLORS = {
    navyHeader: [13, 59, 102],     // #0D3B66 — Azul Marino Institucional
    accentBlue: [59, 130, 246],    // #3B82F6 — Azul de acento y barras
    darkText: [30, 41, 59],        // #1E293B — Texto principal oscuro
    subtitleText: [180, 200, 220], // #B4C8DC — Subtítulos en header
    mutedText: [100, 116, 139],    // #64748B — Textos secundarios
    lightGray: [241, 245, 249],    // #F1F5F9 — Fondo de cajas de info y filas alternas
    borderColor: [226, 232, 240],  // #E2E8F0 — Bordes
    white: [255, 255, 255],
    green: [16, 185, 129],         // #10B981
    amber: [245, 158, 11],         // #F59E0B
    red: [239, 68, 68],            // #EF4444
};

// ─── Cache para logo y fuentes en memoria ───
let logoCircleBase64 = null;
let montserratRegularBase64 = null;
let montserratBoldBase64 = null;

function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

/**
 * Carga las fuentes Montserrat (Regular y Bold) en formato TTF y las registra en el documento jsPDF
 */
async function loadMontserratFonts(doc) {
    try {
        if (!montserratRegularBase64 || !montserratBoldBase64) {
            const [regRes, boldRes] = await Promise.all([
                fetch('https://cdn.jsdelivr.net/fontsource/fonts/montserrat@latest/latin-400-normal.ttf'),
                fetch('https://cdn.jsdelivr.net/fontsource/fonts/montserrat@latest/latin-700-normal.ttf')
            ]);
            if (regRes.ok && boldRes.ok) {
                const [regBuf, boldBuf] = await Promise.all([
                    regRes.arrayBuffer(),
                    boldRes.arrayBuffer()
                ]);
                montserratRegularBase64 = arrayBufferToBase64(regBuf);
                montserratBoldBase64 = arrayBufferToBase64(boldBuf);
            }
        }

        if (montserratRegularBase64 && montserratBoldBase64) {
            doc.addFileToVFS('Montserrat-Regular.ttf', montserratRegularBase64);
            doc.addFont('Montserrat-Regular.ttf', 'Montserrat', 'normal');
            doc.addFileToVFS('Montserrat-Bold.ttf', montserratBoldBase64);
            doc.addFont('Montserrat-Bold.ttf', 'Montserrat', 'bold');
            return 'Montserrat';
        }
    } catch (e) {
        console.warn('[PDF] No se pudo cargar Montserrat TTF desde CDN, usando Helvetica fallback:', e);
    }
    return 'helvetica';
}

/**
 * Carga el logo oficial y lo recorta circularmente (idéntico al módulo de Asociaciones)
 */
async function loadCircularLogoBase64() {
    if (logoCircleBase64) return logoCircleBase64;
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
        return logoCircleBase64;
    } catch {
        return null;
    }
}

/**
 * Limpia y sanitiza texto para jsPDF.
 * ELIMINA emojis y secuencias de bytes corruptas (como Ø<ßå y Ø=0£) que rompen jsPDF.
 */
export function cleanMarkdown(text) {
    if (!text) return '';
    return text
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        .replace(/`(.*?)`/g, '$1')
        .replace(/\[ACTION:[^\]]+\]/g, '')
        // Eliminar secuencias corruptas ya codificadas por fuentes estándar jsPDF
        .replace(/Ø<ßå/g, '')
        .replace(/Ø=0£/g, '')
        .replace(/Ø<[^\s]*/g, '')
        .replace(/Ø=[^\s]*/g, '')
        // Eliminar emojis y caracteres gráficos no ASCII / suplementarios
        .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/gu, '')
        // Limpiar dobles pipes o barras defectuosas de tablas rotas
        .replace(/\|{2,}/g, '|')
        // Mantener caracteres legibles en español (ñ, acentos, mayúsculas, minúsculas, números, puntuación)
        .replace(/[^\x20-\x7E\xA0-\xFF\u00C0-\u017F]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Parsea el texto y tablas del reporte de Beto
 */
export function parseBetoReport(markdown) {
    if (!markdown) return [];
    const lines = markdown.split('\n');
    const sections = [];
    let currentTable = null;
    let currentText = [];

    for (const line of lines) {
        const trimmed = line.trim();

        if (!trimmed) {
            if (currentText.length > 0) {
                sections.push({ type: 'text', content: currentText.join('\n') });
                currentText = [];
            }
            continue;
        }

        // Encabezados
        if (trimmed.startsWith('## ') || trimmed.startsWith('# ')) {
            if (currentText.length > 0) {
                sections.push({ type: 'text', content: currentText.join('\n') });
                currentText = [];
            }
            const level = trimmed.startsWith('## ') ? 2 : 1;
            const text = cleanMarkdown(trimmed.replace(/^#+\s*/, ''));
            sections.push({ type: 'heading', level, content: text });
            continue;
        }

        if (trimmed.startsWith('### ')) {
            if (currentText.length > 0) {
                sections.push({ type: 'text', content: currentText.join('\n') });
                currentText = [];
            }
            sections.push({ type: 'subheading', content: cleanMarkdown(trimmed.replace(/^###\s*/, '')) });
            continue;
        }

        // Filas de tablas markdown
        if (trimmed.startsWith('|')) {
            if (currentText.length > 0) {
                sections.push({ type: 'text', content: currentText.join('\n') });
                currentText = [];
            }

            // Ignorar separadores |---|---|
            if (/^\|[\s\-:|]+\|$/.test(trimmed) || trimmed.includes('---')) {
                continue;
            }

            // Sanitizar celdas
            const rawCells = trimmed.split('|')
                .map(c => cleanMarkdown(c))
                .filter(c => c.length > 0);

            if (rawCells.length > 0) {
                if (!currentTable) {
                    currentTable = { type: 'table', headers: rawCells, rows: [] };
                } else {
                    // Si tiene el mismo número de columnas o compatible
                    currentTable.rows.push(rawCells);
                }
                continue;
            }
        }

        // Fin de tabla
        if (currentTable && !trimmed.startsWith('|')) {
            sections.push(currentTable);
            currentTable = null;
        }

        // Viñetas o listado de pacientes (- Paciente o • Paciente)
        if (trimmed.startsWith('- ') || trimmed.startsWith('• ') || trimmed.startsWith('* ')) {
            if (currentText.length > 0) {
                sections.push({ type: 'text', content: currentText.join('\n') });
                currentText = [];
            }
            sections.push({ type: 'bullet', content: cleanMarkdown(trimmed.replace(/^[-•*]\s*/, '')) });
            continue;
        }

        // Métricas destacadas
        if (/[0-9]/.test(trimmed) && (trimmed.toLowerCase().includes('total') || trimmed.toLowerCase().includes('camas') || trimmed.toLowerCase().includes('uci'))) {
            if (currentText.length > 0) {
                sections.push({ type: 'text', content: currentText.join('\n') });
                currentText = [];
            }
            sections.push({ type: 'metric', content: cleanMarkdown(trimmed) });
            continue;
        }

        currentText.push(cleanMarkdown(trimmed));
    }

    if (currentTable) sections.push(currentTable);
    if (currentText.length > 0) sections.push({ type: 'text', content: currentText.join('\n') });

    return sections;
}

/**
 * Genera el documento jsPDF con el estilo oficial de Asociaciones
 */
export async function generateBetoReportPdf(markdown, reportTitle, excelData) {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const fontName = await loadMontserratFonts(doc);
    const logoBase64 = await loadCircularLogoBase64();

    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 14;
    const colW = pageW - margin * 2;
    let y = 0;

    const sections = parseBetoReport(markdown);

    // Si excelData está disponible con columnas y filas, inyectarlo como tabla estructurada limpia
    if (excelData?.columns && excelData?.data?.length > 0) {
        // Remover cualquier tabla imperfecta parseada de markdown
        const tableIdx = sections.findIndex(s => s.type === 'table');
        const cleanTable = {
            type: 'table',
            headers: excelData.columns,
            rows: excelData.data.map(row => row.map(c => String(c ?? '')))
        };
        if (tableIdx >= 0) {
            sections[tableIdx] = cleanTable;
        } else {
            sections.push(cleanTable);
        }
    }

    // Extraer título limpio
    const headingSec = sections.find(s => s.type === 'heading');
    const rawTitle = reportTitle || excelData?.reportName || (headingSec ? headingSec.content : 'Reporte de Pacientes e Indicadores');
    const cleanTitle = cleanMarkdown(rawTitle) || 'Reporte de Pacientes';

    // ═══════════════════════════════════════════
    // 1. HEADER INSTITUCIONAL (Estilo Asociaciones)
    // ═══════════════════════════════════════════
    doc.setFillColor(...COLORS.navyHeader);
    doc.rect(0, 0, pageW, 34, 'F');

    // Logo circular
    const logoX = margin + 1;
    const logoY = 10;
    const logoSize = 14;
    if (logoBase64) {
        doc.setFillColor(...COLORS.white);
        doc.circle(logoX + logoSize / 2, logoY + logoSize / 2, logoSize / 2 + 1.2, 'F');
        doc.addImage(logoBase64, 'PNG', logoX, logoY, logoSize, logoSize);
    } else {
        doc.setFillColor(...COLORS.white);
        doc.circle(logoX + logoSize / 2, logoY + logoSize / 2, logoSize / 2, 'F');
        doc.setFontSize(7);
        doc.setFont(fontName, 'bold');
        doc.setTextColor(...COLORS.navyHeader);
        doc.text('SA', logoX + 3.8, logoY + logoSize / 2 + 1.8);
    }

    // Título y subtítulo izquierdo
    doc.setFontSize(15);
    doc.setTextColor(...COLORS.white);
    doc.setFont(fontName, 'bold');
    doc.text('SANATORIO ARGENTINO', margin + 18, 14);

    doc.setFontSize(8.5);
    doc.setFont(fontName, 'normal');
    doc.setTextColor(...COLORS.subtitleText);
    doc.text('Administración · Reportes Asistente Beto IA', margin + 18, 21);

    // Badge superior derecho
    doc.setFontSize(10.5);
    doc.setFont(fontName, 'bold');
    doc.setTextColor(...COLORS.white);
    doc.text('REPORTE OFICIAL', pageW - margin, 14, { align: 'right' });

    doc.setFontSize(7.5);
    doc.setFont(fontName, 'normal');
    doc.setTextColor(...COLORS.subtitleText);
    doc.text('Sistema ADM-QUI', pageW - margin, 21, { align: 'right' });

    // Línea de acento azul (#3B82F6)
    doc.setFillColor(...COLORS.accentBlue);
    doc.rect(0, 34, pageW, 2, 'F');

    y = 44;

    // ═══════════════════════════════════════════
    // 2. INFO BAR DE METADATOS (Estilo Asociaciones)
    // ═══════════════════════════════════════════
    const now = new Date();
    const fechaHora = now.toLocaleString('es-AR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });

    const tableSection = sections.find(s => s.type === 'table');
    const bulletCount = sections.filter(s => s.type === 'bullet').length;
    const totalRegs = tableSection ? String(tableSection.rows.length) : (bulletCount > 0 ? String(bulletCount) : '—');

    doc.setFillColor(...COLORS.lightGray);
    doc.roundedRect(margin, y, colW, 18, 3, 3, 'F');
    doc.setDrawColor(...COLORS.borderColor);
    doc.roundedRect(margin, y, colW, 18, 3, 3, 'S');

    const infoItems = [
        { label: 'DOCUMENTO', value: cleanTitle.substring(0, 26) },
        { label: 'FECHA Y HORA', value: fechaHora },
        { label: 'ORIGEN / ASISTENTE', value: 'Beto IA · ADM-QUI' },
        { label: 'REGISTROS', value: `${totalRegs} items` },
    ];

    const cellW = colW / 4;
    infoItems.forEach((item, i) => {
        const x = margin + cellW * i + 6;
        doc.setFontSize(6);
        doc.setFont(fontName, 'normal');
        doc.setTextColor(...COLORS.mutedText);
        doc.text(item.label, x, y + 6);

        doc.setFontSize(i === 0 || i === 3 ? 9.5 : 8.5);
        doc.setFont(fontName, 'bold');
        doc.setTextColor(...COLORS.navyHeader);
        doc.text(item.value, x, y + 13);
    });

    y += 26;

    // ═══════════════════════════════════════════
    // 3. SECCIÓN Y CONTENIDO DETALLADO
    // ═══════════════════════════════════════════
    // Título de la sección con barra azul vertical
    doc.setFillColor(...COLORS.accentBlue);
    doc.rect(margin, y, 3, 7, 'F');
    doc.setFontSize(10.5);
    doc.setFont(fontName, 'bold');
    doc.setTextColor(...COLORS.navyHeader);
    doc.text('DETALLE DEL REGISTRO CLÍNICO', margin + 6, y + 5.5);
    y += 12;

    for (const section of sections) {
        if (y > pageH - 25) {
            addFooter(doc, pageW, pageH, margin, fontName);
            doc.addPage();
            y = margin + 5;
        }

        switch (section.type) {
            case 'heading': {
                // Ya se incluyó en el título/info bar
                break;
            }

            case 'subheading': {
                doc.setFontSize(9.5);
                doc.setFont(fontName, 'bold');
                doc.setTextColor(...COLORS.navyHeader);
                doc.text(section.content, margin, y);
                y += 6;
                break;
            }

            case 'metric': {
                doc.setFillColor(...COLORS.lightGray);
                doc.roundedRect(margin, y - 3, colW, 7, 1.5, 1.5, 'F');
                doc.setFontSize(8);
                doc.setFont(fontName, 'bold');
                doc.setTextColor(...COLORS.navyHeader);
                doc.text(section.content, margin + 4, y + 1.5);
                y += 10;
                break;
            }

            case 'bullet': {
                doc.setFillColor(...COLORS.accentBlue);
                doc.circle(margin + 2, y - 1, 1, 'F');
                doc.setFontSize(8.5);
                doc.setFont(fontName, 'normal');
                doc.setTextColor(...COLORS.darkText);
                doc.text(section.content, margin + 6, y);
                y += 5.5;
                break;
            }

            case 'table': {
                const headers = section.headers.map(h => cleanMarkdown(h).toUpperCase());
                const rows = section.rows.map(row =>
                    row.map(cell => cleanMarkdown(cell))
                );

                autoTable(doc, {
                    startY: y,
                    head: [headers],
                    body: rows,
                    margin: { left: margin, right: margin },
                    styles: {
                        font: fontName,
                        fontSize: 7.5,
                        cellPadding: 2.5,
                        lineColor: COLORS.borderColor,
                        lineWidth: 0.2,
                        textColor: COLORS.darkText,
                        valign: 'middle',
                    },
                    headStyles: {
                        fillColor: COLORS.navyHeader,
                        textColor: COLORS.white,
                        fontStyle: 'bold',
                        fontSize: 7.5,
                        halign: 'left',
                    },
                    alternateRowStyles: {
                        fillColor: [248, 250, 252],
                    },
                    columnStyles: generateColumnStyles(headers),
                });

                y = doc.lastAutoTable.finalY + 8;
                break;
            }

            case 'text': {
                const cleanText = cleanMarkdown(section.content);
                if (!cleanText) continue;
                doc.setFontSize(8.5);
                doc.setFont(fontName, 'normal');
                doc.setTextColor(...COLORS.darkText);
                const splitLines = doc.splitTextToSize(cleanText, colW);

                for (const line of splitLines) {
                    if (y > pageH - 25) {
                        addFooter(doc, pageW, pageH, margin, fontName);
                        doc.addPage();
                        y = margin + 5;
                    }
                    doc.text(line, margin, y);
                    y += 4.5;
                }
                y += 3;
                break;
            }
        }
    }

    addFooter(doc, pageW, pageH, margin, fontName);
    return doc;
}

function addFooter(doc, pageWidth, pageHeight, margin, fontName = 'helvetica') {
    doc.setDrawColor(...COLORS.borderColor);
    doc.setLineWidth(0.3);
    doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);

    doc.setFontSize(7);
    doc.setFont(fontName, 'normal');
    doc.setTextColor(...COLORS.mutedText);
    doc.text('Generado por Beto — Asistente IA del Sanatorio Argentino', margin, pageHeight - 7);
    doc.text(`Página ${doc.internal.getNumberOfPages()}`, pageWidth - margin, pageHeight - 7, { align: 'right' });
}

function generateColumnStyles(headers) {
    const styles = {};
    headers.forEach((h, i) => {
        const lower = h.toLowerCase();
        if (lower.includes('nhc') || lower.includes('dni')) {
            styles[i] = { halign: 'center', cellWidth: 20 };
        } else if (lower.includes('fecha') || lower.includes('ingreso') || lower.includes('alta')) {
            styles[i] = { halign: 'center', cellWidth: 22 };
        } else if (lower.includes('servicio') || lower.includes('sector')) {
            styles[i] = { cellWidth: 28 };
        } else if (lower.includes('paciente') || lower.includes('nombre')) {
            styles[i] = { fontStyle: 'bold' };
        }
    });
    return styles;
}

/**
 * Función pública para descargar el PDF
 */
export async function downloadBetoReportPdf(markdown, reportTitle, excelData) {
    const doc = await generateBetoReportPdf(markdown, reportTitle, excelData);
    const safeName = (reportTitle || excelData?.reportName || 'Reporte_Beto')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
    const date = new Date().toISOString().split('T')[0];
    doc.save(`${safeName}_${date}.pdf`);
}

/**
 * Función pública para descargar en Excel (.xlsx)
 */
export async function downloadBetoReportExcel(markdown, excelData, reportTitle) {
    try {
        const XLSX = await import('xlsx');
        const wb = XLSX.utils.book_new();

        let title = reportTitle || 'Reporte_Beto';
        let headers = [];
        let dataRows = [];

        if (excelData?.columns && excelData?.data) {
            headers = excelData.columns;
            dataRows = excelData.data;
            if (excelData.reportName) title = excelData.reportName;
        } else {
            const sections = parseBetoReport(markdown);
            const tableSec = sections.find(s => s.type === 'table');
            if (tableSec && tableSec.headers?.length) {
                headers = tableSec.headers.map(h => cleanMarkdown(h));
                dataRows = tableSec.rows.map(r => r.map(c => cleanMarkdown(c)));
            } else {
                // Extraer viñetas si no hay tabla
                const bulletLines = sections
                    .filter(s => s.type === 'bullet')
                    .map(b => [b.content]);
                if (bulletLines.length > 0) {
                    headers = ['Paciente / Detalle'];
                    dataRows = bulletLines;
                }
            }
        }

        if (headers.length === 0 && dataRows.length === 0) {
            console.warn('[Excel] No hay datos estructurados para exportar');
            return;
        }

        const headerBlock = [
            ['SANATORIO ARGENTINO — ASISTENTE BETO IA'],
            [`Reporte: ${cleanMarkdown(title)}`],
            [`Fecha de Generación: ${new Date().toLocaleString('es-AR')}`],
            [],
            headers
        ];

        const allRows = [...headerBlock, ...dataRows];
        const ws = XLSX.utils.aoa_to_sheet(allRows);

        // Auto-ajustar anchos de columnas
        ws['!cols'] = headers.map((h, i) => {
            const maxLen = Math.max(
                h.length,
                ...dataRows.slice(0, 100).map(r => String(r[i] || '').length)
            );
            return { wch: Math.min(Math.max(maxLen + 3, 14), 50) };
        });

        XLSX.utils.book_append_sheet(wb, ws, 'Pacientes');
        const safeName = (title || 'Reporte_Beto')
            .replace(/[^a-zA-Z0-9_\-]+/g, '_')
            .replace(/^_+|_+$/g, '');
        const dateStr = new Date().toISOString().split('T')[0];
        XLSX.writeFile(wb, `${safeName}_${dateStr}.xlsx`);
    } catch (err) {
        console.error('[BetoReport] Error exportando a Excel:', err);
    }
}

/**
 * Detecta si un mensaje tiene características de reporte o listado
 */
export function isReportMessage(content) {
    if (!content) return false;
    const hasTable = (content.match(/\|/g) || []).length >= 4;
    const hasBullets = (content.match(/^[-•*]\s+/m) || []).length >= 1;
    const hasPatients = /(pacientes|internados|camas|cirugías|deudas|altas|detalle)/i.test(content);
    return (hasTable || hasBullets) && hasPatients;
}
