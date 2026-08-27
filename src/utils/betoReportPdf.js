/**
 * betoReportPdf.js — Genera PDFs profesionales desde los reportes de Beto IA
 * 
 * Parsea markdown tables + texto de Beto y genera un PDF con estilo
 * institucional del Sanatorio Argentino usando jsPDF + autoTable.
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ─── Color palette (Institucional Sanatorio Argentino) ───
const COLORS = {
    primary: [79, 70, 229],        // #4F46E5 — Indigo (Beto brand)
    primaryLight: [238, 242, 255], // #EEF2FF
    dark: [30, 41, 59],            // #1E293B
    gray: [100, 116, 139],         // #64748B
    lightGray: [241, 245, 249],    // #F1F5F9
    white: [255, 255, 255],
    green: [16, 185, 129],         // #10B981
    amber: [245, 158, 11],         // #F59E0B
    red: [239, 68, 68],            // #EF4444
};

/**
 * Parse markdown content from Beto's response to extract:
 * - Title
 * - Subtitle/date
 * - Tables (| header | header |)
 * - Key metrics (lines with emojis/bold)
 * - Plain text paragraphs
 */
function parseBetoReport(markdown) {
    const lines = markdown.split('\n');
    const sections = [];
    let currentTable = null;
    let currentText = [];

    for (const line of lines) {
        const trimmed = line.trim();

        // Skip empty lines
        if (!trimmed) {
            if (currentText.length > 0) {
                sections.push({ type: 'text', content: currentText.join('\n') });
                currentText = [];
            }
            continue;
        }

        // Headers (## or ###)
        if (trimmed.startsWith('## ') || trimmed.startsWith('# ')) {
            if (currentText.length > 0) {
                sections.push({ type: 'text', content: currentText.join('\n') });
                currentText = [];
            }
            const level = trimmed.startsWith('## ') ? 2 : 1;
            const text = trimmed.replace(/^#+\s*/, '').replace(/\*\*/g, '');
            sections.push({ type: 'heading', level, content: text });
            continue;
        }

        if (trimmed.startsWith('### ')) {
            if (currentText.length > 0) {
                sections.push({ type: 'text', content: currentText.join('\n') });
                currentText = [];
            }
            sections.push({ type: 'subheading', content: trimmed.replace(/^###\s*/, '').replace(/\*\*/g, '') });
            continue;
        }

        // Table rows
        if (trimmed.startsWith('|')) {
            // Close any pending text
            if (currentText.length > 0) {
                sections.push({ type: 'text', content: currentText.join('\n') });
                currentText = [];
            }

            // Skip separator rows (|---|---|)
            if (/^\|[\s\-:]+\|/.test(trimmed)) {
                continue;
            }

            const cells = trimmed.split('|').filter(c => c.trim() !== '').map(c => c.trim());

            if (!currentTable) {
                currentTable = { type: 'table', headers: cells, rows: [] };
            } else {
                currentTable.rows.push(cells);
            }
            continue;
        }

        // End of table
        if (currentTable && !trimmed.startsWith('|')) {
            sections.push(currentTable);
            currentTable = null;
        }

        // Metric line (contains emoji + bold or numbers)
        if (/[📊🔔💰🏥📋⚠️✅❌📈📉🔴🟢🟡🟣🔵]/.test(trimmed) && /\d+/.test(trimmed)) {
            if (currentText.length > 0) {
                sections.push({ type: 'text', content: currentText.join('\n') });
                currentText = [];
            }
            sections.push({ type: 'metric', content: trimmed });
            continue;
        }

        // Regular text
        currentText.push(trimmed);
    }

    // Flush remaining
    if (currentTable) sections.push(currentTable);
    if (currentText.length > 0) sections.push({ type: 'text', content: currentText.join('\n') });

    return sections;
}

/**
 * Clean markdown formatting from text
 */
function cleanMarkdown(text) {
    return text
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        .replace(/`(.*?)`/g, '$1')
        .replace(/\[ACTION:[^\]]+\]/g, '')
        .trim();
}

/**
 * Generate a professional PDF from Simon's report markdown
 * @param {string} markdown - The raw markdown content from Simon
 * @param {string} [reportTitle] - Optional override title
 * @returns {jsPDF} The generated PDF document
 */
export function generateBetoReportPdf(markdown, reportTitle) {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    const contentWidth = pageWidth - margin * 2;
    let y = margin;

    const sections = parseBetoReport(markdown);

    // ─── HEADER BAR ───
    doc.setFillColor(...COLORS.primary);
    doc.rect(0, 0, pageWidth, 28, 'F');

    // Header text
    doc.setTextColor(...COLORS.white);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Sanatorio Argentino', margin, 12);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('Reporte generado por Simon — Asistente IA', margin, 19);

    // Date on the right
    const now = new Date();
    const dateStr = now.toLocaleDateString('es-AR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
    doc.setFontSize(8);
    doc.text(dateStr, pageWidth - margin, 19, { align: 'right' });

    y = 36;

    // ─── REPORT TITLE ───
    const title = reportTitle || extractTitle(sections) || 'Reporte de Simon';
    doc.setTextColor(...COLORS.dark);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(cleanMarkdown(title), margin, y);
    y += 8;

    // Thin separator line
    doc.setDrawColor(...COLORS.primaryLight);
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageWidth - margin, y);
    y += 6;

    // ─── RENDER SECTIONS ───
    for (const section of sections) {
        // Check page break
        if (y > pageHeight - 25) {
            addFooter(doc, pageWidth, pageHeight, margin);
            doc.addPage();
            y = margin + 5;
        }

        switch (section.type) {
            case 'heading': {
                if (section === sections[0] && section.type === 'heading') continue; // Skip first heading (already in title)
                doc.setFontSize(12);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(...COLORS.dark);
                doc.text(cleanMarkdown(section.content), margin, y);
                y += 7;
                break;
            }

            case 'subheading': {
                doc.setFontSize(10);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(...COLORS.primary);
                doc.text(cleanMarkdown(section.content), margin, y);
                y += 6;
                break;
            }

            case 'metric': {
                // Render as a styled metric line
                const cleanText = cleanMarkdown(section.content);
                doc.setFillColor(...COLORS.lightGray);
                doc.roundedRect(margin, y - 3, contentWidth, 7, 1.5, 1.5, 'F');
                doc.setFontSize(8.5);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(...COLORS.dark);
                doc.text(cleanText, margin + 3, y + 1.5);
                y += 10;
                break;
            }

            case 'table': {
                const headers = section.headers.map(h => cleanMarkdown(h));
                const rows = section.rows.map(row =>
                    row.map(cell => cleanMarkdown(cell))
                );

                autoTable(doc, {
                    startY: y,
                    head: [headers],
                    body: rows,
                    margin: { left: margin, right: margin },
                    styles: {
                        fontSize: 7.5,
                        cellPadding: 2.5,
                        lineColor: [226, 232, 240],
                        lineWidth: 0.2,
                        textColor: COLORS.dark,
                        font: 'helvetica',
                    },
                    headStyles: {
                        fillColor: COLORS.primary,
                        textColor: COLORS.white,
                        fontStyle: 'bold',
                        fontSize: 7.5,
                        halign: 'left',
                    },
                    alternateRowStyles: {
                        fillColor: COLORS.lightGray,
                    },
                    columnStyles: generateColumnStyles(headers),
                    didParseCell: (data) => {
                        // Color-code status cells
                        if (data.section === 'body') {
                            const val = (data.cell.raw || '').toString().toLowerCase();
                            if (val.includes('confirmad') || val === 'azul' || val.includes('✅')) {
                                data.cell.styles.textColor = COLORS.green;
                                data.cell.styles.fontStyle = 'bold';
                            } else if (val.includes('pendiente') || val === 'amarillo' || val.includes('⚠️')) {
                                data.cell.styles.textColor = COLORS.amber;
                                data.cell.styles.fontStyle = 'bold';
                            } else if (val.includes('problem') || val === 'rojo' || val.includes('❌')) {
                                data.cell.styles.textColor = COLORS.red;
                                data.cell.styles.fontStyle = 'bold';
                            }
                        }
                    },
                });

                y = doc.lastAutoTable.finalY + 8;
                break;
            }

            case 'text': {
                const cleanText = cleanMarkdown(section.content);
                if (!cleanText) continue;
                doc.setFontSize(8.5);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(...COLORS.gray);
                const splitLines = doc.splitTextToSize(cleanText, contentWidth);
                
                for (const line of splitLines) {
                    if (y > pageHeight - 25) {
                        addFooter(doc, pageWidth, pageHeight, margin);
                        doc.addPage();
                        y = margin + 5;
                    }
                    doc.text(line, margin, y);
                    y += 4;
                }
                y += 3;
                break;
            }
        }
    }

    // ─── FOOTER ───
    addFooter(doc, pageWidth, pageHeight, margin);

    return doc;
}

/**
 * Extract the title from parsed sections
 */
function extractTitle(sections) {
    const heading = sections.find(s => s.type === 'heading');
    return heading ? heading.content : null;
}

/**
 * Add page footer with branding
 */
function addFooter(doc, pageWidth, pageHeight, margin) {
    doc.setDrawColor(...COLORS.primaryLight);
    doc.setLineWidth(0.3);
    doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);

    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.gray);
    doc.text('Generado por Simon — Asistente IA del Sanatorio Argentino', margin, pageHeight - 7);
    doc.text(`Página ${doc.internal.getNumberOfPages()}`, pageWidth - margin, pageHeight - 7, { align: 'right' });
}

/**
 * Generate smart column styles based on header names
 */
function generateColumnStyles(headers) {
    const styles = {};
    headers.forEach((h, i) => {
        const lower = h.toLowerCase();
        if (lower.includes('fecha') || lower.includes('estado') || lower.includes('status')) {
            styles[i] = { halign: 'center', cellWidth: 22 };
        } else if (lower.includes('monto') || lower.includes('deuda') || lower.includes('total') || lower.includes('$')) {
            styles[i] = { halign: 'right', cellWidth: 22 };
        } else if (lower.includes('paciente') || lower.includes('nombre') || lower.includes('diagnóstico') || lower.includes('proceso')) {
            styles[i] = { cellWidth: 'auto' };
        }
    });
    return styles;
}

/**
 * Convenience function: generate and download PDF
 */
export function downloadBetoReportPdf(markdown, reportTitle) {
    const doc = generateBetoReportPdf(markdown, reportTitle);
    const safeName = (reportTitle || 'reporte-simon')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    const date = new Date().toISOString().split('T')[0];
    doc.save(`${safeName}_${date}.pdf`);
}

/**
 * Detect if a message contains a report-like structure
 * (tables, multiple metrics, structured data)
 */
export function isReportMessage(content) {
    if (!content) return false;
    const hasTable = (content.match(/\|/g) || []).length >= 6;
    const hasHeader = /^#{1,3}\s+.+/m.test(content);
    const hasMetrics = (content.match(/[📊💰🏥📋🔔📈]/g) || []).length >= 2;
    const hasStructuredData = /\d+\s*(cirugías|pacientes|deudas|altas|turnos)/i.test(content);
    return (hasTable && hasHeader) || (hasMetrics && hasStructuredData && content.length > 200);
}
