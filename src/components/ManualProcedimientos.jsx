/**
 * ManualProcedimientos.jsx
 * Manual de Procedimientos — Sistema ADM-QUI
 * Conforme estándares ITAES para acreditación hospitalaria
 * Versión: 1.1 | Fecha: 08/07/2026
 * Desarrollado por Grow Labs para Sanatorio Argentino
 */

import { useState } from 'react';
import { BookOpen, Download, Loader2, CheckCircle2, FileText } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ─── Constantes institucionales ──────────────────────────────────────────────

const DOC_META = {
    codigo:    'ITYS 23',
    revision:  '01',
    version:   '1.1',
    fecha:     new Date().toLocaleDateString('es-AR'),
    estado:    'Vigente — Para aprobación',
    titulo:    'SISTEMA ADMINISTRACIÓN',
    sistema:   'SISTEMA ADMINISTRACIÓN',
    autor:     'lucas marinero',
    departamento: 'Innovación y transformación digital',
    elaboro:   'lucas marinero',
    reviso:    'Gabriela Iragorre',
    aprobo:    'Dr. Carlos Buteler',
};

// Paleta institucional (RGB)
const COLORS = {
    primary:     [30,  87,  153],   // Azul institucional oscuro
    primaryMid:  [41, 128, 185],    // Azul medio
    primaryLight:[214, 234, 248],   // Azul claro (fondos)
    accent:      [26,  82,  118],   // Azul profundo títulos
    white:       [255, 255, 255],
    grayLight:   [245, 247, 250],
    grayMid:     [189, 195, 199],
    grayDark:    [52,  73,  94 ],
    textMain:    [30,  39,  46 ],
    textSub:     [86,  101, 115],
    success:     [39, 174, 96 ],
    warning:     [230, 126, 34 ],
    danger:      [192, 57,  43 ],
    tableHead:   [52,  73,  94 ],
    tableRow1:   [252, 253, 254],
    tableRow2:   [235, 243, 252],
};

// ─── Helpers de dibujo ───────────────────────────────────────────────────────

/**
 * Dibuja el encabezado institucional en cada página.
 * @param {jsPDF} doc
 * @param {number} pageNum - Número de página actual
 * @param {number} totalPages - Total de páginas (aproximado)
 */
function drawHeader(doc, pageNum, totalPages) {
    const W = doc.internal.pageSize.getWidth();
    const CW = W - 28;
    const ML = 14;

    doc.setDrawColor(0, 0, 0); // black borders
    doc.setLineWidth(0.3);
    doc.setTextColor(0, 0, 0);

    // Fila 1 y 2 (Grid principal)
    // Col 1: Logo + texto
    doc.rect(ML, 10, 45, 20, 'S'); // Logo box
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text('SANATORIO', ML + 28, 14, { align: 'center' });
    doc.text('ARGENTINO SRL', ML + 28, 17, { align: 'center' });
    doc.line(ML + 16, 18, ML + 45, 18);
    doc.text('INNOVACIÓN Y', ML + 28, 22, { align: 'center' });
    doc.text('TRANSFORMACIÓN DIGITAL', ML + 28, 25, { align: 'center' });

    // Col 2: INSTRUCTIVO + Título
    doc.rect(ML + 45, 10, CW - 90, 20, 'S');
    doc.setFontSize(8);
    doc.text('INSTRUCTIVO:', ML + 47, 14);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(DOC_META.sistema.toUpperCase(), ML + 45 + ((CW - 90)/2), 22, { align: 'center' });

    // Col 3: Código + Revisión + Pág
    doc.rect(ML + CW - 45, 10, 45, 20, 'S');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    doc.text(DOC_META.codigo, ML + CW - 22.5, 15, { align: 'center' });
    doc.setFontSize(10);
    doc.text('Revisión Nº ' + DOC_META.revision, ML + CW - 22.5, 22, { align: 'center' });
    doc.setFontSize(8);
    doc.text(`Pág. ${pageNum} de ${totalPages || '{total_pages_count_string}'}`, ML + CW - 22.5, 28, { align: 'center' });

    // Fila Inferior
    doc.rect(ML, 30, CW, 5, 'S');
    doc.setFontSize(7.5);
    doc.text('VALIDO SOLO EN FORMATO ELECTRÓNICO – LAS COPIAS EN PAPEL CARECEN DE VALOR', ML + (CW/2), 33.5, { align: 'center' });
}

function drawFooter(doc, pageNum) {
    // Blank footer in ITAES
}

function drawSignatures(doc, y) {
    const W = doc.internal.pageSize.getWidth();
    const CW = W - 28;
    const ML = 14;

    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.setTextColor(0, 0, 0);

    const colW = CW / 3;
    
    // Row 1: Headers
    doc.rect(ML, y, colW, 5, 'S');
    doc.rect(ML + colW, y, colW, 5, 'S');
    doc.rect(ML + colW * 2, y, colW, 5, 'S');
    
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text('ELABORADO:', ML + 2, y + 3.5);
    doc.text('REVISADO:', ML + colW + 2, y + 3.5);
    doc.text('APROBADO:', ML + colW * 2 + 2, y + 3.5);

    // Row 2: Signatures block
    doc.rect(ML, y + 5, colW, 20, 'S');
    doc.rect(ML + colW, y + 5, colW, 20, 'S');
    doc.rect(ML + colW * 2, y + 5, colW, 20, 'S');

    doc.setFontSize(8);
    doc.text(DOC_META.elaboro, ML + colW / 2, y + 19, { align: 'center' });
    doc.text(DOC_META.departamento, ML + colW / 2, y + 23, { align: 'center' });

    doc.text(DOC_META.reviso, ML + colW + colW / 2, y + 19, { align: 'center' });
    doc.text('Responsable Documentos SGC', ML + colW + colW / 2, y + 23, { align: 'center' });

    doc.text(DOC_META.aprobo, ML + colW * 2 + colW / 2, y + 19, { align: 'center' });
    doc.text('Director Médico', ML + colW * 2 + colW / 2, y + 23, { align: 'center' });

    return y + 25;
}


/**
 * Agrega una nueva página con encabezado y footer.
 * Retorna el Y inicial del contenido (luego del header).
 */
function addPage(doc, counters) {
    doc.addPage();
    counters.page += 1;
    drawHeader(doc, counters.page, '{total_pages_count_string}');
    drawFooter(doc, counters.page);
    return 40;
}

/**
 * Dibuja un título de sección principal (ej: "1. Introducción").
 */
function sectionTitle(doc, text, y) {
    const W = doc.internal.pageSize.getWidth();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.text(text.toUpperCase(), 14, y + 5.5);
    return y + 10;
}

function subTitle(doc, text, y) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.text(text, 14 + 3, y + 4.5);
    return y + 8;
}

function para(doc, text, y, indent = 14) {
    const W = doc.internal.pageSize.getWidth();
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.textMain);
    const lines = doc.splitTextToSize(text, W - indent - 14);
    doc.text(lines, indent, y);
    return y + lines.length * 4.5 + 2;
}

/**
 * Escribe un bloque de nota/aviso destacado.
 */
function noteBox(doc, text, y, type = 'info') {
    const W = doc.internal.pageSize.getWidth();
    const CW = W - 28;
    const ML = 14;
    const maxW = CW - 4;
    let lines = [];
    text.split('\n').forEach(part => {
        lines = lines.concat(doc.splitTextToSize(part.trim(), maxW - 10));
    });
    const boxH = lines.length * 4.8 + 10;

    doc.setFillColor(250, 250, 250);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.roundedRect(ML, y, CW, boxH, 2, 2, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);
    doc.text(`[NOTA]`, ML + 4, y + 6);
    doc.setFont('helvetica', 'normal');
    doc.text(lines, ML + 4, y + 11);
    return y + boxH + 4;
}

function bulletList(doc, items, y, indent = 20) {
    const W = doc.internal.pageSize.getWidth();
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.textMain);
    for (const item of items) {
        doc.setFont('helvetica', 'bold');
        doc.setFillColor(...COLORS.primaryMid);
        doc.circle(indent - 4, y - 1, 1, 'F');
        doc.setFont('helvetica', 'normal');
        const lines = doc.splitTextToSize(item, W - indent - 14);
        doc.text(lines, indent, y);
        y += lines.length * 4.5 + 1.5;
    }
    return y + 2;
}

/**
 * Verifica si queda espacio suficiente en la página, si no agrega nueva.
 */
function checkPage(doc, y, counters, needed = 30) {
    const H = doc.internal.pageSize.getHeight();
    if (y + needed > H - 14) {
        return addPage(doc, counters);
    }
    return y;
}

// ─── Generador principal del PDF ─────────────────────────────────────────────

export async function generateManualPDF() {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();

    // ─ Cargar logo institucional ──────────────────────────────────────
    let logoDataUrl = null;
    try {
        const resp = await fetch('/logosanatorio.png');
        const blob = await resp.blob();
        logoDataUrl = await new Promise((res, rej) => {
            const reader = new FileReader();
            reader.onload = () => res(reader.result);
            reader.onerror = rej;
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        console.warn('No se pudo cargar el logo, se usará monograma de texto.', e);
    }

    // Contador de páginas mutable
    const counters = { page: 1 }; drawHeader(doc, 1, '{total_pages_count_string}');

    // Registro de índice: { titulo, page }
    const tocEntries = [];

    // ── PÁGINA 1: PORTADA ────────────────────────────────────────────────────
    {
        // Fondo completo
        doc.setFillColor(...COLORS.primary);
        doc.rect(0, 0, W, H, 'F');

        // Banda decorativa diagonal
        doc.setFillColor(...COLORS.primaryMid);
        doc.rect(0, H * 0.52, W, H * 0.48, 'F');

        // Logo institucional (imagen real con fallback a monograma)
        // Logo is handled in header now else {
            // Fallback: monograma de texto
            doc.setFillColor(...COLORS.white);
            doc.roundedRect(W / 2 - 20, 28, 40, 40, 5, 5, 'F');
            doc.setTextColor(...COLORS.primary);
            doc.setFontSize(26);
            doc.setFont('helvetica', 'bold');
            doc.text('SA', W / 2, 53, { align: 'center' });
            doc.setFontSize(7);
            doc.setFont('helvetica', 'normal');
            doc.text('SANATORIO ARGENTINO', W / 2, 60.5, { align: 'center' });

        // Título del documento
        doc.setTextColor(...COLORS.white);
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.text('MANUAL DE', W / 2, 82, { align: 'center' });
        doc.text('PROCEDIMIENTOS', W / 2, 93, { align: 'center' });

        // Nombre del sistema
        doc.setFillColor(...COLORS.white);
        doc.roundedRect(W / 2 - 55, 100, 110, 12, 3, 3, 'F');
        doc.setTextColor(...COLORS.primary);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('Sistema de Admisión Quirúrgica — ADM-QUI', W / 2, 108, { align: 'center' });

        // Línea separadora
        doc.setDrawColor(...COLORS.white);
        doc.setLineWidth(0.5);
        doc.line(30, 118, W - 30, 118);

        // Subtítulo descriptivo
        doc.setTextColor(...COLORS.white);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'italic');
        doc.text('Sistema integral de gestión de admisión quirúrgica,', W / 2, 125, { align: 'center' });
        doc.text('comunicación con pacientes y control administrativo.', W / 2, 131, { align: 'center' });

        // Tabla de control documental
        const ctrlY = 142;
        doc.setFillColor(...COLORS.white);
        doc.roundedRect(20, ctrlY, W - 40, 50, 3, 3, 'F');

        doc.setTextColor(...COLORS.primary);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text('CONTROL DOCUMENTAL', W / 2, ctrlY + 7, { align: 'center' });

        const ctrlData = [
            ['Código del Documento', DOC_META.codigo],
            ['Versión', DOC_META.version],
            ['Fecha de Emisión', DOC_META.fecha],
            ['Estado', DOC_META.estado],
            ['Sistema', `${DOC_META.sistema} v1.0`],
            ['Tecnología', 'Vite + React 19 + Supabase'],
        ];

        doc.setFontSize(8);
        let rowY = ctrlY + 13;
        ctrlData.forEach(([label, value], i) => {
            if (i % 2 === 0) {
                doc.setFillColor(...COLORS.grayLight);
                doc.rect(22, rowY - 3.5, W - 44, 6.5, 'F');
            }
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...COLORS.grayDark);
            doc.text(label + ':', 26, rowY + 0.5);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...COLORS.textMain);
            doc.text(value, 90, rowY + 0.5);
            rowY += 6.5;
        });

        // Elaborado / Revisado / Aprobado
        const firmaY = 202;
        doc.setFillColor(...COLORS.primaryLight);
        doc.rect(20, firmaY, W - 40, 25, 'F');

        const cols = [(W - 40) / 3, (W - 40) / 3, (W - 40) / 3];
        const firmas = [
            { label: 'Elaboró', valor: DOC_META.elaboro },
            { label: 'Revisó', valor: DOC_META.reviso },
            { label: 'Aprobó', valor: DOC_META.aprobo },
        ];
        firmas.forEach((f, i) => {
            const fx = 20 + i * cols[0] + cols[0] / 2;
            doc.setFontSize(7);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...COLORS.primary);
            doc.text(f.label.toUpperCase(), fx, firmaY + 6, { align: 'center' });
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...COLORS.textSub);
            doc.text(f.valor, fx, firmaY + 12, { align: 'center' });
            // Línea de firma
            doc.setDrawColor(...COLORS.primaryMid);
            doc.setLineWidth(0.4);
            doc.line(fx - 20, firmaY + 20, fx + 20, firmaY + 20);
            doc.setFontSize(6);
            doc.text('Firma y Sello', fx, firmaY + 23, { align: 'center' });
        });

        // Footer portada
        doc.setTextColor(...COLORS.white);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'italic');
        doc.text(
            'DOCUMENTO CONTROLADO — Prohibida su reproducción sin autorización | Grow Labs © 2026',
            W / 2, H - 8, { align: 'center' }
        );
        doc.setFont('helvetica', 'normal');
        doc.text('Página 1', W - 14, H - 8, { align: 'right' });
    }

    // ── PÁGINA 2: ÍNDICE ─────────────────────────────────────────────────────
    {
        doc.addPage();
        counters.page = 2;
        drawHeader(doc, 2, null);
        drawFooter(doc, 2);

        let y = 26;
        // Título de Índice
        doc.setFillColor(...COLORS.primary);
        doc.rect(14, y, W - 28, 11, 'F');
        doc.setTextColor(...COLORS.white);
        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.text('ÍNDICE GENERAL', W / 2, y + 7.5, { align: 'center' });
        y += 18;

        // Se construirá el índice real en una segunda pasada, por ahora placeholder
        // que llenaremos más abajo
        // Lo dejamos registrado en un arreglo para post-proceso
        const tocY = y; // posición donde arranca el índice

        // ─────────────────────────────────────────────────────────────────────
        // CONSTRUIMOS TODAS LAS SECCIONES DEL MANUAL
        // Primero recolectamos las páginas de cada sección (post-process del TOC)
        // ─────────────────────────────────────────────────────────────────────

        // Para este enfoque, usamos la página actual para registrar las secciones
        // y luego volvemos a la página 2 para pintar el índice

        // ── SECCIÓN 1: INTRODUCCIÓN Y ALCANCE ────────────────────────────────
        {
            doc.addPage();
            counters.page += 1;
            drawHeader(doc, counters.page, '{total_pages_count_string}');
            drawFooter(doc, counters.page);
            let y2 = 26;

            tocEntries.push({ titulo: '1.  Introducción y Alcance', page: counters.page });

            y2 = sectionTitle(doc, '1.  Introducción y Alcance', y2);

            y2 = subTitle(doc, '1.1  Propósito del Documento', y2);
            y2 = para(doc, 'El presente Manual de Procedimientos describe el funcionamiento, la operación y los flujos de trabajo del Sistema de Admisión Quirúrgica (ADM-QUI) del Sanatorio Argentino. Su objetivo es brindar a los usuarios, auditores y al personal del Departamento de Calidad una guía completa y estructurada que permita comprender, operar y auditar el sistema en su totalidad.', y2 + 1);

            y2 = para(doc, 'Este documento ha sido elaborado conforme a las pautas del Instituto Técnico para la Acreditación de Establecimientos de Salud (ITAES) y las normativas vigentes de gestión de calidad en establecimientos de salud de la República Argentina.', y2 + 1);

            y2 += 4;
            y2 = subTitle(doc, '1.2  Alcance', y2);
            y2 = para(doc, 'Este manual abarca la totalidad de los módulos y funcionalidades del sistema ADM-QUI, incluyendo:', y2 + 1);
            y2 = bulletList(doc, [
                'Todos los módulos de navegación accesibles desde el Sidebar',
                'Flujos de autenticación y gestión de usuarios',
                'Integraciones con sistemas externos (SALUS, WhatsApp, Supabase)',
                'Roles y niveles de acceso',
                'Procedimientos ante fallas del sistema',
                'Indicadores y métricas operativas',
            ], y2);

            y2 = (y2 + 40 > doc.internal.pageSize.getHeight() - 40) ? addPage(doc, counters) : y2;

            y2 = subTitle(doc, '1.3  Acrónimos y Definiciones', y2);
            autoTable(doc, {
                startY: y2,
                margin: { left: 14, right: 14 },
                head: [['Término / Acrónimo', 'Definición']],
                body: [
                    ['ADM-QUI',   'Sistema de Admisión Quirúrgica del Sanatorio Argentino'],
                    ['ITAES',     'Instituto Técnico para la Acreditación de Establecimientos de Salud'],
                    ['OS / OSDE', 'Obra Social / Obra Social de Dirección de Empresas'],
                    ['SALUS',     'Sistema de Gestión Hospitalaria (SQL Server) — sistema legado'],
                    ['PDCA',     'Plan-Do-Check-Act: ciclo de mejora continua de calidad'],
                    ['SPA',      'Single Page Application: aplicación web de página única'],
                    ['API',      'Application Programming Interface: interfaz de programación'],
                    ['WhatsApp / WA', 'Plataforma de mensajería instantánea utilizada para comunicación con pacientes'],
                    ['BuilderBot',   'Proveedor de API para el envío y recepción de mensajes WhatsApp Business'],
                    ['Supabase',     'Plataforma Backend-as-a-Service (PostgreSQL + Edge Functions + Auth)'],
                    ['Edge Function','Función serverless ejecutada en el borde de la red (Supabase)'],
                    ['HC / H.C.',    'Historia Clínica del paciente'],
                    ['IA',           'Inteligencia Artificial'],
                    ['Simón IA',     'Asistente de Inteligencia Artificial integrado en el sistema ADM-QUI'],
                    ['RBAC',         'Role-Based Access Control: control de acceso basado en roles'],
                    ['TyS',          'Área de Tecnología y Sistemas del Sanatorio Argentino'],
                    ['Grow Labs',    'Empresa de desarrollo de software responsable del sistema'],
                ],
                headStyles: { fillColor: COLORS.tableHead, textColor: COLORS.white, fontStyle: 'bold', fontSize: 8 },
                bodyStyles: { fontSize: 7.5, textColor: COLORS.textMain },
                alternateRowStyles: { fillColor: COLORS.tableRow2 },
                columnStyles: { 0: { fontStyle: 'bold', cellWidth: 55 } },
                styles: { cellPadding: 2.5, lineColor: COLORS.grayMid, lineWidth: 0.2 },
            });
            counters.page = Math.ceil(doc.internal.getCurrentPageInfo().pageNumber);
            drawHeader(doc, counters.page, '{total_pages_count_string}');
            drawFooter(doc, counters.page);
        }

        // ── SECCIÓN 2: INFORMACIÓN DEL SISTEMA ───────────────────────────────
        {
            let y2 = addPage(doc, counters);
            tocEntries.push({ titulo: '2.  Información del Sistema', page: counters.page });

            y2 = sectionTitle(doc, '2.  Información del Sistema', y2);

            y2 = subTitle(doc, '2.1  Descripción General', y2);
            y2 = para(doc, 'El Sistema ADM-QUI es una aplicación web de página única (SPA) desarrollada con Vite + React 19, diseñada específicamente para la gestión integral del área de Admisión Quirúrgica del Sanatorio Argentino. Se encuentra en producción desde 2025 y es mantenido por el equipo de Innovación y Transformación Digital (Grow Labs).', y2 + 1);

            y2 += 4;
            y2 = subTitle(doc, '2.2  Stack Tecnológico', y2);
            autoTable(doc, {
                startY: y2,
                margin: { left: 14, right: 14 },
                head: [['Capa', 'Tecnología', 'Versión']],
                body: [
                    ['Frontend',     'Vite + React',               '6.1 / 19.0'],
                    ['UI / Íconos',  'Lucide React + CSS Vanilla',  '0.474 / —'],
                    ['Gráficos',     'Recharts',                    '3.8'],
                    ['Backend / DB', 'Supabase (PostgreSQL)',        '2.97'],
                    ['Autenticación','Supabase Auth + RBAC propio',  '—'],
                    ['Mensajería',   'BuilderBot Cloud API',         '—'],
                    ['Sync SALUS',   'Node.js (sync-server local)',  '—'],
                    ['PDF',          'jsPDF + jsPDF-AutoTable',      '4.2 / 5.0'],
                    ['Exportación',  'XLSX',                        '0.18'],
                    ['Deploy',       'Vercel (producción)',          '—'],
                    ['Control de versiones', 'Git / GitHub',        '—'],
                ],
                headStyles: { fillColor: COLORS.tableHead, textColor: COLORS.white, fontStyle: 'bold', fontSize: 8 },
                bodyStyles: { fontSize: 7.5 },
                alternateRowStyles: { fillColor: COLORS.tableRow2 },
                styles: { cellPadding: 2.5, lineColor: COLORS.grayMid, lineWidth: 0.2 },
            });
            counters.page = Math.ceil(doc.internal.getCurrentPageInfo().pageNumber);
            drawHeader(doc, counters.page, '{total_pages_count_string}');
            drawFooter(doc, counters.page);

            let yn = doc.lastAutoTable.finalY + 8;
            yn = (yn + 50 > doc.internal.pageSize.getHeight() - 40) ? addPage(doc, counters) : yn;
            yn = subTitle(doc, '2.3  Arquitectura del Sistema', yn);
            yn = para(doc, 'La arquitectura del sistema sigue el patrón de aplicación web moderna con backend como servicio (BaaS). El frontend (React) se comunica directamente con Supabase para la persistencia de datos, y con BuilderBot para la mensajería WhatsApp. Un proceso Node.js autónomo (sync-server) se conecta periódicamente al SQL Server de SALUS para sincronizar cirugías, pacientes e internaciones.', yn + 1);

            yn += 3;
            autoTable(doc, {
                startY: yn,
                margin: { left: 14, right: 14 },
                head: [['Componente', 'Responsabilidad', 'Tecnología']],
                body: [
                    ['Frontend SPA',       'Interfaz de usuario — todos los módulos del sistema',           'Vite + React 19'],
                    ['Supabase DB',        'Persistencia de todos los datos operativos',                    'PostgreSQL'],
                    ['Supabase Auth',      'Autenticación y gestión de sesiones de usuario',                'Supabase Auth'],
                    ['Edge Functions',     'Lógica serverless: envío WhatsApp, webhooks, alertas',          'Deno (Supabase)'],
                    ['BuilderBot Cloud',   'Gateway para envío/recepción de mensajes WhatsApp Business',    'API REST'],
                    ['Sync Server',        'Sincronización bidireccional con SALUS (SQL Server local)',      'Node.js + mssql'],
                    ['Vercel CDN',         'Hosting y distribución global del frontend',                    'Vercel'],
                    ['GitHub Repository',  'Control de versiones y CI/CD',                                  'Git / GitHub Actions'],
                ],
                headStyles: { fillColor: COLORS.tableHead, textColor: COLORS.white, fontStyle: 'bold', fontSize: 8 },
                bodyStyles: { fontSize: 7.5 },
                alternateRowStyles: { fillColor: COLORS.tableRow2 },
                styles: { cellPadding: 2.5, lineColor: COLORS.grayMid, lineWidth: 0.2 },
            });
            counters.page = Math.ceil(doc.internal.getCurrentPageInfo().pageNumber);
            drawHeader(doc, counters.page, '{total_pages_count_string}');
            drawFooter(doc, counters.page);
        }

        // ── SECCIÓN 3: ACCESO Y AUTENTICACIÓN ────────────────────────────────
        {
            let y2 = addPage(doc, counters);
            tocEntries.push({ titulo: '3.  Acceso y Autenticación', page: counters.page });

            y2 = sectionTitle(doc, '3.  Acceso y Autenticación', y2);

            y2 = subTitle(doc, '3.1  Ingreso al Sistema', y2);
            y2 = para(doc, 'El acceso al sistema ADM-QUI se realiza mediante la URL institucional. Al ingresar, el sistema presenta la pantalla de autenticación (LoginScreen) que solicita usuario (email) y contraseña. Las credenciales son validadas contra el registro de usuarios configurado en Supabase Auth.', y2 + 1);

            y2 += 3;
            y2 = noteBox(doc, 'IMPORTANTE: Las credenciales son individuales y personales. Cada usuario es responsable de la confidencialidad de su contraseña. No se deben compartir credenciales entre usuarios bajo ninguna circunstancia.', y2, 'warning');

            y2 = subTitle(doc, '3.2  Procedimiento de Inicio de Sesión', y2);
            y2 = bulletList(doc, [
                'Ingresar la URL del sistema en el navegador (Chrome, Edge o Firefox — última versión)',
                'En el campo "Usuario" ingresar el correo electrónico institucional asignado',
                'En el campo "Contraseña" ingresar la contraseña personal',
                'Hacer clic en el botón "Ingresar" o presionar la tecla Enter',
                'El sistema validará las credenciales y redirigirá al panel principal (Inicio)',
                'En caso de error, verificar mayúsculas/minúsculas y espacios en la contraseña',
            ], y2);

            y2 = (y2 + 50 > doc.internal.pageSize.getHeight() - 40) ? addPage(doc, counters) : y2;
            y2 = subTitle(doc, '3.3  Cambio de Contrasena', y2);
            y2 = para(doc, 'Para cambiar la contrasena, el usuario debe hacer clic en el icono de llave (candado) ubicado en la barra superior derecha del sistema. Se abrira un modal que permitira ingresar la contrasena actual y establecer una nueva. Se recomienda usar contrasenas de al menos 8 caracteres con combinacion de letras y numeros.', y2 + 1);

            y2 += 3;
            y2 = subTitle(doc, '3.4  Cierre de Sesion', y2);
            y2 = para(doc, 'Para cerrar la sesion de forma segura, el usuario debe hacer clic en el icono de "Salir" (flecha de salida) ubicado en la barra superior derecha. Esto eliminara la sesion activa y redirigira a la pantalla de inicio de sesion. Es obligatorio cerrar sesion al finalizar la jornada de trabajo, especialmente en equipos compartidos.', y2 + 1);

            y2 += 3;
            y2 = subTitle(doc, '3.5  Modos de Visualizacion', y2);
            y2 = para(doc, 'El sistema ofrece dos modos de visualizacion: Modo Claro (predeterminado) y Modo Oscuro. Se puede alternar entre ambos mediante el icono de luna/sol ubicado en la barra superior. La preferencia se guarda automaticamente en el navegador.', y2 + 1);
        }

        // ── SECCIÓN 4: MÓDULOS DEL SISTEMA ───────────────────────────────────
        {
            let y2 = addPage(doc, counters);
            tocEntries.push({ titulo: '4.  Módulos del Sistema', page: counters.page });

            y2 = sectionTitle(doc, '4.  Módulos del Sistema', y2);
            y2 = para(doc, 'El sistema ADM-QUI está organizado en módulos funcionales accesibles desde el Sidebar lateral. A continuación se describe en detalle cada módulo, su propósito, sus funcionalidades y el procedimiento de uso.', y2 + 1);

            // ─── 4.1 Inicio ──────────────────────────────────────────────────
            y2 += 3;
            y2 = (y2 + 40 > doc.internal.pageSize.getHeight() - 40) ? addPage(doc, counters) : y2;
            tocEntries.push({ titulo: '   4.1  Panel de Inicio', page: counters.page });
            y2 = subTitle(doc, '4.1  Panel de Inicio', y2);
            y2 = para(doc, 'El Panel de Inicio (HomePanel) es la pantalla principal del sistema. Presenta una bienvenida personalizada con el nombre del usuario y ofrece accesos rápidos a los módulos más utilizados. Incluye indicadores de estado del sistema y del servicio WhatsApp.', y2 + 1);
            y2 = bulletList(doc, [
                'Accesos directos a los principales módulos (Cirugías, Pedidos, Mensajería, Deudas)',
                'Indicador de estado de la línea WhatsApp institucional',
                'Fecha y hora actual en tiempo real',
                'Presentación de novedades del sistema',
            ], y2);

            // ─── 4.2 Mensajería ──────────────────────────────────────────────
            y2 = (y2 + 50 > doc.internal.pageSize.getHeight() - 40) ? addPage(doc, counters) : y2;
            tocEntries.push({ titulo: '   4.2  Mensajería y Chat WhatsApp', page: counters.page });
            y2 = subTitle(doc, '4.2  Mensajería y Chat WhatsApp', y2);
            y2 = para(doc, 'El módulo de Mensajería (MessagingPanel) permite la comunicación bidireccional con pacientes, médicos y obras sociales a través de WhatsApp Business. Los mensajes recibidos generan notificaciones en tiempo real con sonido y toasts.', y2 + 1);
            y2 = bulletList(doc, [
                'Chat en tiempo real con actualización instantánea (Supabase Realtime)',
                'Envío de texto, imágenes, documentos (PDF, XLSX, DOCX) y notas de voz',
                'Contador de mensajes no leídos visible en el Sidebar desde cualquier módulo',
                'Búsqueda y filtrado de conversaciones por nombre o número',
                'Historial completo de conversaciones almacenado en base de datos',
                'Acceso directo desde el módulo de Control de Cirugías para cada paciente',
            ], y2);

            y2 = (y2 + 30 > doc.internal.pageSize.getHeight() - 40) ? addPage(doc, counters) : y2;
            y2 = noteBox(doc, 'AVISO INSTITUCIONAL: Los mensajes enviados a través del sistema utilizan la identidad institucional del Sanatorio Argentino (cuenta WhatsApp Business). Los usuarios con roles no administrativos verán un aviso recordatorio antes de enviar.', y2, 'warning');

            // ─── 4.3 Plantillas WhatsApp ─────────────────────────────────────
            y2 = (y2 + 50 > doc.internal.pageSize.getHeight() - 40) ? addPage(doc, counters) : y2;
            tocEntries.push({ titulo: '   4.3  Plantillas WhatsApp', page: counters.page });
            y2 = subTitle(doc, '4.3  Plantillas WhatsApp (Template Manager)', y2);
            y2 = para(doc, 'El Template Manager permite crear y gestionar plantillas de mensajes reutilizables con variables dinámicas. Las plantillas agilizan la comunicación pre-quirúrgica y post-quirúrgica con los pacientes.', y2 + 1);
            y2 = bulletList(doc, [
                'Variables dinámicas disponibles: {nombre}, {fecha_cirugia}, {medico}, {obra_social}',
                'Creación, edición y eliminación de plantillas personalizadas (Shortcuts)',
                'Envío masivo de plantillas a múltiples destinatarios (BulkTemplateSender)',
                'Vista previa del mensaje antes del envío con variables resueltas',
            ], y2);

            // ─── 4.4 Emisión de Pedidos ──────────────────────────────────────
            y2 = (y2 + 50 > doc.internal.pageSize.getHeight() - 40) ? addPage(doc, counters) : y2;
            tocEntries.push({ titulo: '   4.4  Módulo de Pedidos', page: counters.page });
            y2 = subTitle(doc, '4.4  Módulo de Pedidos (Emisión)', y2);
            y2 = para(doc, 'El módulo de Pedidos permite generar solicitudes de prácticas médicas e internaciones para pacientes quirúrgicos. Es el módulo central de la tarea cotidiana del personal de admisión.', y2 + 1);

            y2 += 2;
            autoTable(doc, {
                startY: y2,
                margin: { left: 14, right: 14 },
                head: [['Subcomponente', 'Función']],
                body: [
                    ['PatientHeader',      'Carga de datos del paciente (nombre, OS, afiliado, diagnóstico, médico, fecha)'],
                    ['InternacionSearch',  'Búsqueda y carga de ítems de internación por encabezados institucionales'],
                    ['PracticeSearch',     'Búsqueda de prácticas por nomenclador general (código o descripción)'],
                    ['Cart (Carrito)',     'Visualización y edición de ítems seleccionados con cantidad y fecha por ítem'],
                    ['PrintTemplate',     'Generación de impresión del pedido de prácticas en formato hoja A4'],
                    ['PrintTemplateInternacion', 'Generación de impresión para ítems de internación'],
                ],
                headStyles: { fillColor: COLORS.tableHead, textColor: COLORS.white, fontStyle: 'bold', fontSize: 8 },
                bodyStyles: { fontSize: 7.5 },
                alternateRowStyles: { fillColor: COLORS.tableRow2 },
                columnStyles: { 0: { fontStyle: 'bold', cellWidth: 65 } },
                styles: { cellPadding: 2.5, lineColor: COLORS.grayMid, lineWidth: 0.2 },
            });
            counters.page = Math.ceil(doc.internal.getCurrentPageInfo().pageNumber);
            drawHeader(doc, counters.page, '{total_pages_count_string}');
            drawFooter(doc, counters.page);

            let yn4 = doc.lastAutoTable.finalY + 5;
            yn4 = (yn4 + 40 > doc.internal.pageSize.getHeight() - 40) ? addPage(doc, counters) : yn4;
            yn4 = para(doc, 'Procedimiento de emisión de pedido:', yn4 + 2);
            yn4 = bulletList(doc, [
                '1. Completar los datos del paciente en el encabezado (PatientHeader)',
                '2. Buscar y agregar ítems desde Internaciones y/o Nomenclador de Prácticas',
                '3. Revisar el Carrito: ajustar cantidades y fechas individuales si corresponde',
                '4. Imprimir el pedido con el botón "Imprimir" o enviarlo por WhatsApp',
                '5. El pedido queda registrado automáticamente en el Historial',
            ], yn4);

            // ─── 4.5 Historial ───────────────────────────────────────────────
            yn4 = (yn4 + 40 > doc.internal.pageSize.getHeight() - 40) ? addPage(doc, counters) : yn4;
            tocEntries.push({ titulo: '   4.5  Historial de Pedidos', page: counters.page });
            yn4 = subTitle(doc, '4.5  Historial de Pedidos', yn4);
            yn4 = para(doc, 'El módulo de Historial almacena todos los pedidos generados en el sistema. Permite consultar, expandir el detalle y reimprimir cualquier pedido anterior. Los pedidos se pueden filtrar por estado: Creado, Impreso o Enviado.', yn4 + 1);
            yn4 = bulletList(doc, [
                'Listado de hasta 50 pedidos más recientes por defecto',
                'Expansión de filas para ver el detalle de prácticas de cada pedido',
                'Botón de reimpresión individual por pedido o por práctica',
                'Estados visuales: [Impreso] color azul / [Enviado] color verde / [Creado] color gris',
            ], yn4);

            // ─── 4.6 Nomenclador ─────────────────────────────────────────────
            yn4 = (yn4 + 40 > doc.internal.pageSize.getHeight() - 40) ? addPage(doc, counters) : yn4;
            tocEntries.push({ titulo: '   4.6  Nomenclador de Prácticas', page: counters.page });
            yn4 = subTitle(doc, '4.6  Nomenclador de Prácticas', yn4);
            yn4 = para(doc, 'El módulo Nomenclador (NomencladorView) permite consultar el listado completo de prácticas médicas disponibles, con sus códigos, descripciones y categorías. Desde este módulo también se puede agregar prácticas directamente al carrito activo.', yn4 + 1);

            // ─── 4.7 Control de Cirugías ─────────────────────────────────────
            yn4 = (yn4 + 60 > doc.internal.pageSize.getHeight() - 40) ? addPage(doc, counters) : yn4;
            tocEntries.push({ titulo: '   4.7  Control de Cirugías (Panel Principal)', page: counters.page });
            yn4 = subTitle(doc, '4.7  Control de Cirugías — Panel Principal (SurgeryPanel)', yn4);
            yn4 = para(doc, 'El SurgeryPanel es el módulo más completo del sistema. Centraliza toda la operación del quirófano: visualización de la programación quirúrgica sincronizada desde SALUS, gestión preoperatoria de cada paciente, comunicación WhatsApp y control de estado de cada intervención.', yn4 + 1);
            yn4 = bulletList(doc, [
                'Visualización de cirugías programadas del día, semana o rango personalizado',
                'Sincronización en tiempo real con el sistema SALUS via sync-server Node.js',
                'Apertura de ficha completa de cada paciente quirúrgico',
                'Emisión de pedidos directos desde el panel de cirugía del paciente',
                'Envío de mensajes WhatsApp pre-operatorios al paciente y/o familiar',
                'Registro de estado de la cirugía: pendiente, en curso, realizada, cancelada',
                'Control de presupuestos y coseguros por paciente',
                'Vista de laboratorios y análisis preoperatorios del paciente',
                'Impresión de documentación administrativa asociada a la cirugía',
            ], yn4);

            // ─── 4.8 Deudas ──────────────────────────────────────────────────
            yn4 = (yn4 + 50 > doc.internal.pageSize.getHeight() - 40) ? addPage(doc, counters) : yn4;
            tocEntries.push({ titulo: '   4.8  Gestión de Deudas', page: counters.page });
            yn4 = subTitle(doc, '4.8  Gestión de Deudas (DeudasPanel)', yn4);
            yn4 = para(doc, 'El módulo de Deudas permite el control de deudas pendientes de pacientes y obras sociales. Facilita la comunicación de deuda y el seguimiento del cobro.', yn4 + 1);
            yn4 = bulletList(doc, [
                'Listado de deudas pendientes con filtros por obra social, paciente y fecha',
                'Registro del monto, concepto y estado de cada deuda',
                'Envío de notificaciones WhatsApp de deuda directamente al paciente',
                'Historial de gestión de cobros por deuda',
                'Exportación de datos para liquidación',
            ], yn4);

            // ─── 4.9 Altas Administrativas ───────────────────────────────────
            yn4 = (yn4 + 50 > doc.internal.pageSize.getHeight() - 40) ? addPage(doc, counters) : yn4;
            tocEntries.push({ titulo: '   4.9  Altas Administrativas', page: counters.page });
            yn4 = subTitle(doc, '4.9  Altas Administrativas (AltasPanel)', yn4);
            yn4 = para(doc, 'El módulo de Altas gestiona el proceso completo de alta administrativa de pacientes internados, incluyendo el flujo de traspaso de fichas a Facturación, la detección automática de facturas en SALUS, y el circuito de devoluciones.', yn4 + 1);

            yn4 = (yn4 + 30 > doc.internal.pageSize.getHeight() - 40) ? addPage(doc, counters) : yn4;
            yn4 = para(doc, 'Estados disponibles en Control de Altas:', yn4 + 1);
            yn4 = bulletList(doc, [
                'Procesada — Ficha recién creada, sin gestión',
                'En auditoría — En revisión por el equipo',
                'Prórroga — Se solicitó extensión de la internación',
                'Con presupuesto — Se generó presupuesto para la OS',
                'Alta Adm — Alta administrativa confirmada (detectada automáticamente desde SALUS o manualmente)',
                'Suspendida — Ficha suspendida temporalmente',
                'Facturada — Detectada automáticamente cuando existe factura en PDV 21/31 de SALUS',
                'Devuelta FAC — La ficha fue devuelta desde el módulo de Facturación',
            ], yn4);

            yn4 = (yn4 + 25 > doc.internal.pageSize.getHeight() - 40) ? addPage(doc, counters) : yn4;
            yn4 = noteBox(doc, 'CRUCE DE MES: El sistema limpia automáticamente el panel de Altas Parciales a principios de mes si las altas pertenecen a meses anteriores, enviando las fichas pendientes al historial para no mezclar la facturación de periodos distintos.', yn4, 'info');

            yn4 = (yn4 + 40 > doc.internal.pageSize.getHeight() - 40) ? addPage(doc, counters) : yn4;
            yn4 = para(doc, 'Flujo de Traspaso a Facturación:', yn4 + 2);
            yn4 = bulletList(doc, [
                '1. Seleccionar fichas con los checkboxes de la columna izquierda',
                '2. Hacer clic en "Enviar al carrito" (barra inferior flotante)',
                '3. Ir a la pestaña "Carrito" para revisar las fichas seleccionadas',
                '4. Hacer clic en "Generar Traspaso" — se abre el modal de remito',
                '5. Completar: Entrega (usuario actual) y Recibe (dropdown de analistas o nombre libre)',
                '6. Confirmar: se genera un remito con código único (TR-XXXXXX-X)',
                '7. Imprimir el PDF del remito con membrete institucional del Sanatorio Argentino',
                '8. Las fichas traspasadas aparecen automáticamente en el módulo de Facturación',
            ], yn4);

            yn4 = (yn4 + 20 > doc.internal.pageSize.getHeight() - 40) ? addPage(doc, counters) : yn4;
            yn4 = noteBox(doc, 'FACTURACIÓN AUTOMÁTICA: Cuando el sync-server detecta que el número de admisión existe en las facturas de SALUS (Punto de Venta 21 y 31), el sistema marca automáticamente la ficha como "Facturada" y asigna el usuario que facturó como responsable.', yn4, 'info');

            // ─── 4.10 Facturación Internada ──────────────────────────────────
            yn4 = (yn4 + 50 > doc.internal.pageSize.getHeight() - 40) ? addPage(doc, counters) : yn4;
            tocEntries.push({ titulo: '   4.10  Facturación Internada', page: counters.page });
            yn4 = subTitle(doc, '4.10  Facturación Internada (FacturacionPanel)', yn4);
            yn4 = para(doc, 'El módulo de Facturación Internada muestra las fichas que fueron traspasadas desde Control de Altas. Permite asignar analistas, gestionar estados, ver el detalle de facturación de SALUS y gestionar devoluciones.', yn4 + 1);

            yn4 = (yn4 + 30 > doc.internal.pageSize.getHeight() - 40) ? addPage(doc, counters) : yn4;
            yn4 = para(doc, 'KPIs superiores:', yn4 + 1);
            yn4 = bulletList(doc, [
                'Total — Cantidad total de fichas traspasadas en el período',
                'Pendientes — Fichas sin gestionar',
                'En proceso — Fichas en proceso de facturación',
                'Facturadas — Fichas con factura detectada en SALUS (PDV 21/31)',
                'Devueltas — Fichas devueltas a Control de Altas',
                'Auto (SALUS) — Fichas marcadas automáticamente por el cruce con facturación de SALUS',
            ], yn4);

            yn4 = (yn4 + 40 > doc.internal.pageSize.getHeight() - 40) ? addPage(doc, counters) : yn4;
            yn4 = para(doc, 'Flujo de Devolución a Control de Altas:', yn4 + 2);
            yn4 = bulletList(doc, [
                '1. Seleccionar fichas con problemas usando los checkboxes',
                '2. Ir a la pestaña "Carrito Devolución"',
                '3. Agregar motivo de devolución por cada ficha',
                '4. Generar el remito de devolución con firma digital',
                '5. Las fichas vuelven a Control de Altas con estado "Devuelta FAC"',
                '6. El operador de Altas puede cambiar el estado para re-gestionarlas',
            ], yn4);

            yn4 = (yn4 + 20 > doc.internal.pageSize.getHeight() - 40) ? addPage(doc, counters) : yn4;
            yn4 = noteBox(doc, 'DETALLE DE FACTURA: Al expandir una fila se muestran las líneas de concepto traídas desde SALUS (tabla TABLEAU_Detalle de ventas). Incluye número de factura, concepto, usuario que facturó y punto de venta (21 o 31).', yn4, 'info');

            // ─── 4.11 Asignaciones ───────────────────────────────────────────
            yn4 = (yn4 + 40 > doc.internal.pageSize.getHeight() - 40) ? addPage(doc, counters) : yn4;
            tocEntries.push({ titulo: '   4.11  Asignaciones', page: counters.page });
            yn4 = subTitle(doc, '4.11  Asignaciones (AsignacionPanel)', yn4);
            yn4 = para(doc, 'El módulo de Asignaciones gestiona la asignación de recursos, camas y personal a los pacientes. Permite el control de la disponibilidad operativa del área quirúrgica.', yn4 + 1);

            // ─── 4.12 Auditoría de Historias Clínicas ────────────────────────
            yn4 = (yn4 + 60 > doc.internal.pageSize.getHeight() - 40) ? addPage(doc, counters) : yn4;
            tocEntries.push({ titulo: '   4.12  Auditoría de Historias Clínicas', page: counters.page });
            yn4 = subTitle(doc, '4.12  Auditoría de Historias Clínicas (AuditoriaHistoriasPanel)', yn4);
            yn4 = para(doc, 'Este módulo permite la revisión sistemática y el control de calidad de las historias clínicas de pacientes. Está orientado al personal del área de Auditoría Médica y Calidad.', yn4 + 1);
            yn4 = bulletList(doc, [
                'Listado de historias clínicas pendientes de auditoría',
                'Registro de hallazgos y observaciones por ítem auditado',
                'Control de integridad documental (presencia de firmas, fechas, diagnósticos)',
                'Generación de reportes de auditoría por período',
                'Seguimiento de correcciones solicitadas',
                'Exportación de datos de auditoría para el Departamento de Calidad',
            ], yn4);

            // ─── 4.13 Cola de Turnos ─────────────────────────────────────────
            yn4 = (yn4 + 50 > doc.internal.pageSize.getHeight() - 40) ? addPage(doc, counters) : yn4;
            tocEntries.push({ titulo: '   4.13  Cola de Turnos (Kiosco)', page: counters.page });
            yn4 = subTitle(doc, '4.13  Cola de Turnos — Sistema Kiosco (TurnoAdminPanel / TurnoKiosco)', yn4);
            yn4 = para(doc, 'El módulo de Turnos implementa un sistema tipo kiosco para la gestión de la cola de espera en el área de admisión. Incluye un panel de administración (para el personal) y una vista pública de kiosco para pacientes.', yn4 + 1);
            yn4 = bulletList(doc, [
                'Panel de administración: creación, llamado y gestión de turnos',
                'Vista kiosco: pantalla de visualización para pacientes en sala de espera',
                'Numeración automática de turnos con categorías (preferencial, general)',
                'Sonido de llamado audible al llamar un turno',
                'Llamado dinámico: Cualquier box libre puede atender un turno en espera',
                'Registro de tiempos de espera para métricas de calidad de atención',
            ], yn4);

            // ─── 4.14 Consultas de Guardia ───────────────────────────────────
            yn4 = (yn4 + 40 > doc.internal.pageSize.getHeight() - 40) ? addPage(doc, counters) : yn4;
            tocEntries.push({ titulo: '   4.14  Consultas de Guardia', page: counters.page });
            yn4 = subTitle(doc, '4.14  Consultas de Guardia (ConsultasPanel)', yn4);
            yn4 = para(doc, 'Módulo de registro y seguimiento de consultas realizadas en el servicio de guardia. Permite el control estadístico de la demanda de guardia y la facturación de consultas.', yn4 + 1);

            // ─── 4.15 Entrega Asociaciones ───────────────────────────────────
            yn4 = (yn4 + 50 > doc.internal.pageSize.getHeight() - 40) ? addPage(doc, counters) : yn4;
            tocEntries.push({ titulo: '   4.15  Entrega a Asociaciones', page: counters.page });
            yn4 = subTitle(doc, '4.15  Entrega a Asociaciones (AsociacionesEntregaPanel)', yn4);
            yn4 = para(doc, 'Módulo para el control de entrega de documentación y muestras a laboratorios de anatomía patológica externos y asociaciones médicas. Gestiona la trazabilidad de cada envío.', yn4 + 1);
            yn4 = bulletList(doc, [
                'Registro de envíos con fecha, destinatario y contenido',
                'Generación de constancias de entrega con firma digital',
                'Seguimiento del estado de recepción en destino',
                'Alertas por entregas pendientes de confirmación',
            ], yn4);

            // ─── 4.16 Laboratorios / Anatomía Patológica ─────────────────────
            yn4 = (yn4 + 50 > doc.internal.pageSize.getHeight() - 40) ? addPage(doc, counters) : yn4;
            tocEntries.push({ titulo: '   4.16  Laboratorios y Anatomía Patológica', page: counters.page });
            yn4 = subTitle(doc, '4.16  Laboratorios y Anatomía Patológica (LaboratoriosPanel)', yn4);
            yn4 = para(doc, 'Módulo integrado para la gestión de solicitudes de laboratorio y anatomía patológica. Se conecta con los laboratorios externos (LDA - Dra. Aguero/Rios, LAB. CEDAP, LAB. INST. PATOLOG. CUYO) a través de una vista pública autenticada (LabPortal).', yn4 + 1);
            yn4 = bulletList(doc, [
                'Portal autenticado para cada laboratorio externo (/lab/aguero, /lab/cedap, /lab/cuyo)',
                'Visualización de solicitudes pendientes por laboratorio',
                'Registro de resultados y estado de cada muestra',
                'Notificación al área de admisión cuando los resultados están disponibles',
                'Vista pública legacy redirigida automáticamente a la nueva URL autenticada',
            ], yn4);

            // ─── 4.17 Métricas e Indicadores ─────────────────────────────────
            yn4 = (yn4 + 60 > doc.internal.pageSize.getHeight() - 40) ? addPage(doc, counters) : yn4;
            tocEntries.push({ titulo: '   4.17  Métricas e Indicadores', page: counters.page });
            yn4 = subTitle(doc, '4.17  Métricas e Indicadores (MetricsPanel / AltasMetricsPanel)', yn4);
            yn4 = para(doc, 'El módulo de Métricas ofrece un dashboard de indicadores de rendimiento del área de admisión quirúrgica. Los datos se actualizan en tiempo real desde la base de datos.', yn4 + 1);
            yn4 = bulletList(doc, [
                'Volumen de cirugías programadas y realizadas por período',
                'Tiempos promedio de admisión y alta',
                'Distribución de cirugías por obra social y especialidad',
                'Indicadores de comunicación WhatsApp (mensajes enviados/recibidos)',
                'Métricas de deudas: montos pendientes por obra social',
                'Indicadores de altas administrativas: altas del día, semana, mes',
                'Filtros dinámicos de rango de fechas (Hoy, Ayer, 7 días, 30 días, Custom) en métricas de atención',
                'Gráficos interactivos exportables (Recharts)',
            ], yn4);

            // ─── 4.17 Simón IA ───────────────────────────────────────────────
            yn4 = (yn4 + 60 > doc.internal.pageSize.getHeight() - 40) ? addPage(doc, counters) : yn4;
            tocEntries.push({ titulo: '   4.17  Asistente IA — Simón', page: counters.page });
            yn4 = subTitle(doc, '4.17  Asistente IA — Simón (BetoPanel / BetoWidget)', yn4);
            yn4 = para(doc, 'Simón es el asistente de inteligencia artificial integrado en el sistema ADM-QUI. Puede accederse desde el módulo dedicado (BetoPanel) o mediante el widget flotante disponible en toda la interfaz (BetoWidget).', yn4 + 1);
            yn4 = bulletList(doc, [
                'Responde consultas sobre procedimientos operativos y normativas internas',
                'Asistencia para la búsqueda de prácticas y nomencladores',
                'Acceso rápido mediante atajos de teclado (Ctrl+K — Command Palette)',
                'Modo presentación para capacitaciones (BetoPresentationMode)',
                'Tutorial interactivo para nuevos usuarios (BetoTutorial)',
                'Analytics de uso del asistente (BetoAnalyticsPanel)',
            ], yn4);

            // ─── 4.18 Configuración ──────────────────────────────────────────
            yn4 = (yn4 + 40 > doc.internal.pageSize.getHeight() - 40) ? addPage(doc, counters) : yn4;
            tocEntries.push({ titulo: '   4.18  Configuración del Sistema', page: counters.page });
            yn4 = subTitle(doc, '4.18  Configuración del Sistema (ConfigPanel)', yn4);
            yn4 = para(doc, 'El panel de Configuración permite a los usuarios autorizados ajustar los parámetros del sistema. Incluye configuraciones de integración, gestión de accesos y descarga del presente Manual de Procedimientos.', yn4 + 1);
            yn4 = bulletList(doc, [
                'Configuración de integraciones (BuilderBot, Supabase)',
                'Gestión de shortcuts y plantillas del sistema',
                'Parámetros del sync con SALUS',
                'Acceso al Manual de Procedimientos (documento presente)',
                'Gestión de usuarios y roles (para administradores)',
            ], yn4);
        }

        // ── SECCIÓN 5: INTEGRACIONES EXTERNAS ────────────────────────────────
        {
            let y2 = addPage(doc, counters);
            tocEntries.push({ titulo: '5.  Integración con Sistemas Externos', page: counters.page });

            y2 = sectionTitle(doc, '5.  Integración con Sistemas Externos', y2);

            y2 = subTitle(doc, '5.1  Integración con SALUS (Sistema Hospitalario Legado)', y2);
            y2 = para(doc, 'SALUS es el sistema hospitalario de gestión clínica del Sanatorio Argentino, basado en SQL Server. La integración se realiza mediante un proceso Node.js autónomo denominado "sync-server" que se ejecuta localmente en la red interna del sanatorio.', y2 + 1);
            y2 = bulletList(doc, [
                'El sync-server se conecta al SQL Server de SALUS usando el driver mssql',
                'Extrae datos de cirugías programadas, internaciones y pacientes en tiempo real',
                'Sincroniza los datos hacia Supabase para que el frontend pueda accederlos',
                'El proceso incluye mecanismos de reintento ante fallos de conexión',
                'Frecuencia de sincronización: configurable (por defecto cada pocos minutos)',
                'Script de instalación disponible: "Instalar SALUS Sync.bat"',
                'Script de actualización: "Actualizar SALUS.bat"',
            ], y2);

            y2 = (y2 + 35 > doc.internal.pageSize.getHeight() - 40) ? addPage(doc, counters) : y2;
            y2 = noteBox(doc, 'DEPENDENCIA CRÍTICA: Si el sync-server se detiene, los datos de cirugías y pacientes en el sistema dejarán de actualizarse. En caso de detectar datos desactualizados, verificar que el proceso "sync-server" esté activo en el servidor local.', y2, 'danger');

            y2 = subTitle(doc, '5.2  Integración con WhatsApp Business (BuilderBot Cloud)', y2);
            y2 = para(doc, 'La mensajería WhatsApp se gestiona a través de la API de BuilderBot Cloud, que actúa como intermediario entre el sistema y la API oficial de WhatsApp Business. La integración es bidireccional: el sistema puede enviar mensajes y recibir respuestas en tiempo real.', y2 + 1);
            autoTable(doc, {
                startY: y2,
                margin: { left: 14, right: 14 },
                head: [['Componente', 'Función']],
                body: [
                    ['send-whatsapp (Edge Function)', 'Recibe la solicitud del frontend y la envía al API de BuilderBot con normalización de payload'],
                    ['whatsapp-webhook (Edge Function)', 'Recibe mensajes entrantes desde BuilderBot y los persiste en la tabla whatsapp_messages de Supabase'],
                    ['whatsapp_messages (tabla)', 'Almacena el historial completo de mensajes (dirección, contenido, media, timestamps)'],
                    ['whatsapp_shortcuts (tabla)', 'Almacena las plantillas reutilizables de mensajes con variables dinámicas'],
                    ['whatsapp-media (bucket)', 'Storage de Supabase para los archivos multimedia compartidos (imágenes, audio, documentos)'],
                ],
                headStyles: { fillColor: COLORS.tableHead, textColor: COLORS.white, fontStyle: 'bold', fontSize: 8 },
                bodyStyles: { fontSize: 7.5 },
                alternateRowStyles: { fillColor: COLORS.tableRow2 },
                columnStyles: { 0: { fontStyle: 'bold', cellWidth: 75 } },
                styles: { cellPadding: 2.5, lineColor: COLORS.grayMid, lineWidth: 0.2 },
            });
            counters.page = Math.ceil(doc.internal.getCurrentPageInfo().pageNumber);
            drawHeader(doc, counters.page, '{total_pages_count_string}');
            drawFooter(doc, counters.page);

            let y5 = doc.lastAutoTable.finalY + 8;
            y5 = (y5 + 40 > doc.internal.pageSize.getHeight() - 40) ? addPage(doc, counters) : y5;
            y5 = subTitle(doc, '5.3  Base de Datos — Supabase (PostgreSQL)', y5);
            y5 = para(doc, 'Supabase es la plataforma de backend del sistema ADM-QUI. Provee base de datos PostgreSQL, autenticación, almacenamiento de archivos y funciones serverless (Edge Functions). Los datos del sistema residen exclusivamente en Supabase.', y5 + 1);
            y5 = bulletList(doc, [
                'Acceso: https://app.supabase.com (solo para administradores del sistema)',
                'Autenticación: Supabase Auth con tokens JWT de corta duración',
                'Edge Functions: funciones serverless para lógica de negocio sensible',
                'Realtime: suscripciones en tiempo real para mensajes y actualizaciones',
                'Storage: almacenamiento de archivos multimedia (bucket whatsapp-media)',
                'Backups automáticos diarios incluidos en el plan de Supabase',
            ], y5);
        }

        // ── SECCIÓN 6: ROLES Y PERMISOS ───────────────────────────────────────
        {
            let y2 = addPage(doc, counters);
            tocEntries.push({ titulo: '6.  Roles y Permisos de Acceso', page: counters.page });

            y2 = sectionTitle(doc, '6.  Roles y Permisos de Acceso', y2);

            y2 = subTitle(doc, '6.1  Roles del Sistema', y2);
            y2 = para(doc, 'El sistema implementa un control de acceso basado en roles (RBAC). Cada usuario tiene asignado un rol que determina qué módulos y acciones puede realizar. Los roles son asignados por el administrador del sistema.', y2 + 1);

            y2 += 2;
            autoTable(doc, {
                startY: y2,
                margin: { left: 14, right: 14 },
                head: [['Rol', 'Descripción', 'Nivel de Acceso']],
                body: [
                    ['Administrador', 'Acceso total al sistema. Gestión de usuarios, configuración avanzada y todas las funcionalidades.', 'Completo'],
                    ['Operador',      'Acceso a módulos operativos del día a día: pedidos, cirugías, mensajería, altas, deudas, turnos.', 'Operativo'],
                    ['Auditoría',     'Acceso al módulo de Auditoría de Historias Clínicas y Métricas. Solo lectura en el resto.', 'Restringido'],
                    ['Solo Lectura',  'Acceso de consulta a datos históricos y métricas sin capacidad de modificación.', 'Solo consulta'],
                ],
                headStyles: { fillColor: COLORS.tableHead, textColor: COLORS.white, fontStyle: 'bold', fontSize: 8 },
                bodyStyles: { fontSize: 7.5 },
                alternateRowStyles: { fillColor: COLORS.tableRow2 },
                columnStyles: { 0: { fontStyle: 'bold', cellWidth: 35 }, 2: { cellWidth: 30 } },
                styles: { cellPadding: 2.5, lineColor: COLORS.grayMid, lineWidth: 0.2 },
            });
            counters.page = Math.ceil(doc.internal.getCurrentPageInfo().pageNumber);
            drawHeader(doc, counters.page, '{total_pages_count_string}');
            drawFooter(doc, counters.page);

            let y6 = doc.lastAutoTable.finalY + 8;
            y6 = (y6 + 80 > doc.internal.pageSize.getHeight() - 40) ? addPage(doc, counters) : y6;
            y6 = subTitle(doc, '6.2  Matriz de Acceso por Módulo', y6);
            y6 += 2;

            autoTable(doc, {
                startY: y6,
                margin: { left: 14, right: 14 },
                head: [['Modulo', 'Admin', 'Operador', 'Auditoria', 'Solo Lectura']],
                body: [
                    ['Inicio (Home)',              'Total',         'Total',         'Total',         'Total'],
                    ['Mensajeria y Chat',          'Total',         'Total',         'Sin acceso',    'Sin acceso'],
                    ['Plantillas WhatsApp',        'Total',         'Total',         'Sin acceso',    'Sin acceso'],
                    ['Nuevo Pedido',               'Total',         'Total',         'Solo lectura',  'Sin acceso'],
                    ['Historial de Pedidos',       'Total',         'Total',         'Solo lectura',  'Solo lectura'],
                    ['Nomenclador',                'Total',         'Total',         'Solo lectura',  'Solo lectura'],
                    ['Control de Cirugia',         'Total',         'Total',         'Solo lectura',  'Sin acceso'],
                    ['Deudas',                     'Total',         'Total',         'Solo lectura',  'Sin acceso'],
                    ['Altas Administrativas',      'Total',         'Total',         'Sin acceso',    'Sin acceso'],
                    ['Asignaciones',               'Total',         'Total',         'Sin acceso',    'Sin acceso'],
                    ['Auditoria de H.C.',          'Total',         'Sin acceso',    'Total',         'Solo lectura'],
                    ['Cola de Turnos',             'Total',         'Total',         'Sin acceso',    'Sin acceso'],
                    ['Consultas de Guardia',       'Total',         'Total',         'Sin acceso',    'Sin acceso'],
                    ['Entrega Asociaciones',       'Total',         'Total',         'Solo lectura',  'Sin acceso'],
                    ['Laboratorios / Anatomia',    'Total',         'Total',         'Solo lectura',  'Sin acceso'],
                    ['Metricas e Indicadores',     'Total',         'Total',         'Total',         'Solo lectura'],
                    ['Simon IA',                   'Total',         'Total',         'Total',         'Total'],
                    ['Configuracion',              'Total',         'Sin acceso',    'Sin acceso',    'Sin acceso'],
                    ['Manual del Sistema',         'Total',         'Total',         'Total',         'Total'],
                ],
                headStyles: { fillColor: COLORS.tableHead, textColor: COLORS.white, fontStyle: 'bold', fontSize: 7.5 },
                bodyStyles: { fontSize: 7 },
                alternateRowStyles: { fillColor: COLORS.tableRow2 },
                columnStyles: {
                    0: { fontStyle: 'bold', cellWidth: 60 },
                    1: { cellWidth: 28, halign: 'center' },
                    2: { cellWidth: 28, halign: 'center' },
                    3: { cellWidth: 28, halign: 'center' },
                    4: { cellWidth: 28, halign: 'center' },
                },
                styles: { cellPadding: 2, lineColor: COLORS.grayMid, lineWidth: 0.2 },
                didParseCell: (data) => {
                    if (data.section === 'body' && data.column.index > 0) {
                        const val = data.cell.raw;
                        if (val === 'Total') {
                            data.cell.styles.textColor = [39, 174, 96];  // verde
                            data.cell.styles.fontStyle = 'bold';
                        } else if (val === 'Sin acceso') {
                            data.cell.styles.textColor = [192, 57, 43];  // rojo
                        } else if (val === 'Solo lectura') {
                            data.cell.styles.textColor = [41, 128, 185]; // azul
                        }
                    }
                },
            });
            counters.page = Math.ceil(doc.internal.getCurrentPageInfo().pageNumber);
            drawHeader(doc, counters.page, '{total_pages_count_string}');
            drawFooter(doc, counters.page);
        }

        // ── SECCIÓN 7: PROCEDIMIENTO ANTE FALLOS ──────────────────────────────
        {
            let y2 = addPage(doc, counters);
            tocEntries.push({ titulo: '7.  Procedimientos ante Fallas del Sistema', page: counters.page });

            y2 = sectionTitle(doc, '7.  Procedimientos ante Fallas del Sistema', y2);

            y2 = subTitle(doc, '7.1  Tabla de Errores Frecuentes y Acciones Correctivas', y2);
            y2 += 2;
            autoTable(doc, {
                startY: y2,
                margin: { left: 14, right: 14 },
                head: [['Síntoma / Error Observado', 'Causa Probable', 'Acción Correctiva']],
                body: [
                    ['No puedo iniciar sesión', 'Contraseña incorrecta o cuenta bloqueada', 'Verificar mayúsculas. Si persiste, contactar a TyS para reseteo.'],
                    ['El sistema no carga (pantalla en blanco)', 'Error de conexión a Supabase o Vercel caído', 'Verificar conexión a internet. Limpiar caché (Ctrl+Shift+R). Informar a TyS.'],
                    ['Los datos de cirugías no se actualizan', 'Sync-server detenido o SALUS no responde', 'Verificar que el proceso sync-server esté corriendo en el servidor local. Reiniciarlo si es necesario.'],
                    ['WhatsApp no envía mensajes', 'Línea BuilderBot desconectada o Edge Function caída', 'Verificar estado de la línea en el indicador del sistema (topbar). Si está rojo, contactar a TyS.'],
                    ['Error al imprimir pedido', 'Popup bloqueado por el navegador', 'Permitir popups para el dominio del sistema en la configuración del navegador.'],
                    ['El chat no muestra mensajes nuevos', 'Supabase Realtime desconectado', 'Recargar la página (F5). Si persiste, informar a TyS.'],
                    ['No puedo acceder a un módulo', 'Permisos insuficientes para el rol asignado', 'Contactar al administrador del sistema para revisión de permisos.'],
                    ['Error "403 Forbidden" o "401 Unauthorized"', 'Sesión expirada o token inválido', 'Cerrar sesión y volver a ingresar. Si persiste, informar a TyS.'],
                    ['Los laboratorios externos no pueden ver sus solicitudes', 'URL legacy o credenciales de lab portal caducadas', 'Redirigir a /lab/[slug]. Verificar credenciales con TyS.'],
                    ['El PDF del manual no se genera', 'Error de librería jsPDF o bloqueo de popup', 'Verificar que popups estén permitidos. Actualizar el navegador.'],
                ],
                headStyles: { fillColor: COLORS.tableHead, textColor: COLORS.white, fontStyle: 'bold', fontSize: 7.5 },
                bodyStyles: { fontSize: 7 },
                alternateRowStyles: { fillColor: COLORS.tableRow2 },
                columnStyles: {
                    0: { cellWidth: 52, fontStyle: 'bold' },
                    1: { cellWidth: 50 },
                },
                styles: { cellPadding: 2.5, lineColor: COLORS.grayMid, lineWidth: 0.2 },
            });
            counters.page = Math.ceil(doc.internal.getCurrentPageInfo().pageNumber);
            drawHeader(doc, counters.page, '{total_pages_count_string}');
            drawFooter(doc, counters.page);

            let y7 = doc.lastAutoTable.finalY + 8;
            y7 = (y7 + 40 > doc.internal.pageSize.getHeight() - 40) ? addPage(doc, counters) : y7;
            y7 = subTitle(doc, '7.2  Contacto de Soporte Técnico', y7);
            y7 = bulletList(doc, [
                'Área responsable: Innovación y Transformación Digital (TyS) — Sanatorio Argentino',
                'Proveedor de desarrollo: Grow Labs',
                'Repositorio del sistema: github.com/lucasmmg12/quirofano (acceso restringido)',
                'Ante cualquier falla crítica que afecte la operación, comunicar de inmediato a TyS',
            ], y7 + 2);

            y7 = (y7 + 30 > doc.internal.pageSize.getHeight() - 40) ? addPage(doc, counters) : y7;
            y7 = noteBox(doc, 'CONTINGENCIA: En caso de falla total del sistema, los procesos de admisión quirúrgica deben continuar en modo manual (formularios en papel) hasta restablecer el servicio. TyS debe ser notificado dentro de los primeros 15 minutos de detectada la falla.', y7, 'danger');
        }

        // ── SECCIÓN 8: HISTORIAL DE VERSIONES ────────────────────────────────
        {
            let y2 = addPage(doc, counters);
            tocEntries.push({ titulo: '8.  Historial de Versiones', page: counters.page });

            y2 = sectionTitle(doc, '8.  Historial de Versiones del Sistema', y2);
            y2 += 2;
            autoTable(doc, {
                startY: y2,
                margin: { left: 14, right: 14 },
                head: [['Versión', 'Fecha', 'Descripción de Cambios', 'Responsable']],
                body: [
                    ['v1.0', '01/06/2026', 'Versión inicial en producción. Módulos: Inicio, Pedidos, Cirugías, Mensajería, Deudas, Altas, Auditoría HC, Turnos, Consultas, Laboratorios, Métricas, Simón IA, Configuración.', 'Grow Labs / TyS'],
                    ['v1.0', '01/06/2026', 'Primera emisión del Manual de Procedimientos. Código: ADM-QUI-MP-001.', 'Grow Labs / TyS'],
                    ['v1.1', '08/07/2026', 'Mejoras en turnos, filtros dinámicos de métricas, y lógica de cruce de mes en Altas Parciales.', 'Grow Labs / TyS'],
                ],
                headStyles: { fillColor: COLORS.tableHead, textColor: COLORS.white, fontStyle: 'bold', fontSize: 8 },
                bodyStyles: { fontSize: 7.5 },
                alternateRowStyles: { fillColor: COLORS.tableRow2 },
                columnStyles: { 0: { cellWidth: 18 }, 1: { cellWidth: 24 }, 3: { cellWidth: 38 } },
                styles: { cellPadding: 2.5, lineColor: COLORS.grayMid, lineWidth: 0.2 },
            });
            counters.page = Math.ceil(doc.internal.getCurrentPageInfo().pageNumber);
            drawHeader(doc, counters.page, '{total_pages_count_string}');
            drawFooter(doc, counters.page);
        }

        // ── SECCIÓN 9: FIRMAS Y APROBACIONES ─────────────────────────────────
        {
            let y2 = addPage(doc, counters);
            tocEntries.push({ titulo: '9.  Firmas y Aprobaciones (ITAES)', page: counters.page });

            y2 = sectionTitle(doc, '9.  Firmas y Aprobaciones Institucionales', y2);

            y2 = para(doc, 'Conforme a los estándares del Instituto Técnico para la Acreditación de Establecimientos de Salud (ITAES), el presente manual requiere las firmas de elaboración, revisión y aprobación institucional para su entrada en vigencia oficial.', y2 + 2);

            y2 += 4;
            y2 = noteBox(doc, 'ESTADO DEL DOCUMENTO: El presente manual se encuentra en estado "Para Aprobación". Debe ser revisado por el Departamento de Calidad y aprobado por la Dirección Médica antes de su circulación oficial. La firma en los campos a continuación otorga vigencia al documento.', y2, 'warning');

            y2 += 4;

            // Bloques de firma ITAES
            const firmaBlockData = [
                {
                    titulo: 'ELABORÓ',
                    nombre: '_________________________________________',
                    cargo: 'Área de Innovación y Transformación Digital',
                    fecha: `Fecha: ${DOC_META.fecha}`,
                    color: COLORS.primaryLight,
                },
                {
                    titulo: 'REVISÓ',
                    nombre: '_________________________________________',
                    cargo: 'Departamento de Calidad Institucional',
                    fecha: 'Fecha: _____ / _____ / _________',
                    color: [255, 243, 199],
                },
                {
                    titulo: 'APROBÓ',
                    nombre: '_________________________________________',
                    cargo: 'Dirección Médica — Sanatorio Argentino',
                    fecha: 'Fecha: _____ / _____ / _________',
                    color: [220, 252, 231],
                },
            ];

            firmaBlockData.forEach((blk) => {
                y2 = (y2 + 45 > doc.internal.pageSize.getHeight() - 40) ? addPage(doc, counters) : y2;
                doc.setFillColor(...blk.color);
                doc.roundedRect(14, y2, W - 28, 38, 3, 3, 'F');
                doc.setDrawColor(...COLORS.grayMid);
                doc.setLineWidth(0.3);
                doc.roundedRect(14, y2, W - 28, 38, 3, 3, 'S');

                // Etiqueta rol
                doc.setFillColor(...COLORS.primary);
                doc.roundedRect(16, y2 + 2, 28, 7, 2, 2, 'F');
                doc.setTextColor(...COLORS.white);
                doc.setFontSize(8);
                doc.setFont('helvetica', 'bold');
                doc.text(blk.titulo, 30, y2 + 7, { align: 'center' });

                // Campos
                doc.setTextColor(...COLORS.grayDark);
                doc.setFontSize(8);
                doc.setFont('helvetica', 'normal');
                doc.text('Nombre y Apellido / Firma y Sello:', 18, y2 + 16);

                doc.setDrawColor(...COLORS.grayMid);
                doc.setLineWidth(0.5);
                doc.line(18, y2 + 24, W - 16, y2 + 24);

                doc.setFontSize(7.5);
                doc.setFont('helvetica', 'bold');
                doc.text(blk.cargo, 18, y2 + 29);
                doc.setFont('helvetica', 'normal');
                doc.text(blk.fecha, W - 14, y2 + 29, { align: 'right' });

                doc.setFontSize(6.5);
                doc.setTextColor(...COLORS.textSub);
                doc.text('Firma y Sello institucional', W / 2, y2 + 35, { align: 'center' });

                y2 += 44;
            });

            y2 = (y2 + 30 > doc.internal.pageSize.getHeight() - 40) ? addPage(doc, counters) : y2;
            y2 += 4;
            y2 = noteBox(doc, `Código de documento: ${DOC_META.codigo} | Versión: ${DOC_META.version} | Fecha de emisión: ${DOC_META.fecha}\nEste documento reemplaza a cualquier versión anterior del manual de procedimientos del sistema ADM-QUI. Una vez aprobado, el original firmado debe archivarse en el Departamento de Calidad.`, y2, 'info');
        }

        // ── COMPLETAR ÍNDICE EN PÁGINA 2 ─────────────────────────────────────
        {
            const totalPages = counters.page;
            currentY = (currentY + 30 > doc.internal.pageSize.getHeight() - 40) ? addPage(doc, counters) : currentY;
    currentY = drawSignatures(doc, currentY + 10);
    doc.setPage(2);
            // Completar TOC
            let ty = tocY;
            tocEntries.forEach((entry, i) => {
                const isMain = !entry.titulo.startsWith('   ');
                if (ty > 270) {
                    // Overflow (no debería pasar, pero por seguridad)
                    return;
                }

                if (isMain) {
                    // Fondo para sección principal
                    doc.setFillColor(...COLORS.primaryLight);
                    doc.rect(14, ty - 3.5, W - 28, 7, 'F');
                }

                doc.setFontSize(isMain ? 9 : 8);
                doc.setFont('helvetica', isMain ? 'bold' : 'normal');
                if (isMain) {
                    doc.setTextColor(...COLORS.accent);
                } else {
                    doc.setTextColor(...COLORS.textMain);
                }

                const title = entry.titulo.trimStart();
                const pageStr = `${entry.page}`;

                // Línea de puntos
                const titleW = doc.getTextWidth(title);
                const pageW = doc.getTextWidth(pageStr);
                const dotStart = (isMain ? 18 : 24) + titleW + 2;
                const dotEnd = W - 14 - pageW - 2;

                doc.text(title, isMain ? 18 : 24, ty);
                doc.text(pageStr, W - 14, ty, { align: 'right' });

                // Puntos guía
                doc.setFontSize(8);
                doc.setTextColor(...COLORS.grayMid);
                if (dotEnd > dotStart + 5) {
                    const dotStr = '.'.repeat(Math.floor((dotEnd - dotStart) / doc.getTextWidth('.')));
                    doc.text(dotStr, dotStart, ty);
                }
                doc.setTextColor(...COLORS.textMain);

                ty += isMain ? 8 : 6;
            });

            doc.putTotalPages('{total_pages_count_string}');
            doc.setPage(counters.page);
        }
    }

    // ─── Descargar el PDF ────────────────────────────────────────────────────
    doc.save(`Manual_ADM-QUI_v${DOC_META.version}_${DOC_META.fecha.replaceAll('/', '-')}.pdf`);
}

// ─── Componente React ────────────────────────────────────────────────────────

export default function ManualProcedimientos() {
    const [loading, setLoading] = useState(false);
    const [done, setDone] = useState(false);

    const handleDownload = async () => {
        setLoading(true);
        setDone(false);
        try {
            await generateManualPDF();
            setDone(true);
            setTimeout(() => setDone(false), 4000);
        } catch (err) {
            console.error('Error generando PDF:', err);
            alert('Error al generar el PDF. Verificar consola para detalles.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            minHeight: '100vh',
            background: 'var(--neutral-50, #F8FAFC)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'flex-start',
            padding: '40px 24px',
            gap: '0',
        }}>
            {/* Hero Card */}
            <div style={{
                width: '100%',
                maxWidth: '760px',
                background: 'var(--neutral-0, #fff)',
                borderRadius: '20px',
                boxShadow: '0 4px 32px rgba(30,87,153,0.10)',
                overflow: 'hidden',
                border: '1px solid var(--neutral-100, #E2E8F0)',
            }}>
                {/* Header del card */}
                <div style={{
                    background: 'linear-gradient(135deg, #1E5799 0%, #2980B9 100%)',
                    padding: '32px 36px 28px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '20px',
                }}>
                    <div style={{
                        width: '56px', height: '56px',
                        background: 'rgba(255,255,255,0.15)',
                        borderRadius: '14px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                    }}>
                        <BookOpen size={28} color="#fff" />
                    </div>
                    <div>
                        <h1 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.01em' }}>
                            Manual de Procedimientos
                        </h1>
                        <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'rgba(255,255,255,0.75)', fontWeight: 400 }}>
                            Sistema de Admisión Quirúrgica — ADM-QUI
                        </p>
                    </div>
                    <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                        <span style={{
                            display: 'inline-block',
                            background: 'rgba(255,255,255,0.2)',
                            color: '#fff',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            padding: '4px 10px',
                            borderRadius: '20px',
                            letterSpacing: '0.04em',
                        }}>
                            ITAES COMPLIANT
                        </span>
                        <p style={{ margin: '6px 0 0', fontSize: '0.72rem', color: 'rgba(255,255,255,0.65)' }}>
                            Código: ADM-QUI-MP-001
                        </p>
                    </div>
                </div>

                {/* Cuerpo del card */}
                <div style={{ padding: '28px 36px 32px' }}>
                    {/* Metadatos del documento */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: '12px',
                        marginBottom: '24px',
                    }}>
                        {[
                            { label: 'Versión', value: 'v1.0', color: '#1E5799' },
                            { label: 'Fecha de Emisión', value: '01/06/2026', color: '#1E5799' },
                            { label: 'Estado', value: 'Para Aprobación', color: '#E67E22' },
                        ].map(item => (
                            <div key={item.label} style={{
                                background: '#F8FAFC',
                                borderRadius: '10px',
                                padding: '12px 16px',
                                border: '1px solid #E2E8F0',
                                textAlign: 'center',
                            }}>
                                <p style={{ margin: 0, fontSize: '0.7rem', color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{item.label}</p>
                                <p style={{ margin: '4px 0 0', fontSize: '0.88rem', color: item.color, fontWeight: 700 }}>{item.value}</p>
                            </div>
                        ))}
                    </div>

                    {/* Descripción */}
                    <p style={{ margin: '0 0 20px', fontSize: '0.875rem', color: '#475569', lineHeight: 1.6 }}>
                        Documento de control interno que describe en su totalidad el funcionamiento, la operación y los flujos de trabajo del sistema ADM-QUI. Elaborado conforme a los estándares <strong>ITAES</strong> para acreditación hospitalaria. Incluye índice completo, descripción de todos los módulos, roles y permisos, integraciones externas, procedimientos ante fallos y sección de firmas institucionales.
                    </p>

                    {/* Contenido del PDF */}
                    <div style={{
                        background: '#EFF6FF',
                        borderRadius: '10px',
                        padding: '16px 20px',
                        marginBottom: '24px',
                        border: '1px solid #BFDBFE',
                    }}>
                        <p style={{ margin: '0 0 10px', fontSize: '0.78rem', fontWeight: 700, color: '#1E5799', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            📋 Contenido del documento
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px' }}>
                            {[
                                '1. Introducción y Alcance (con acrónimos)',
                                '2. Información y Arquitectura del Sistema',
                                '3. Acceso y Autenticación',
                                '4. Módulos del Sistema (18 módulos)',
                                '5. Integraciones Externas (SALUS, WA, Supabase)',
                                '6. Roles y Permisos — Matriz de Acceso',
                                '7. Procedimientos ante Fallas',
                                '8. Historial de Versiones',
                                '9. Firmas y Aprobaciones (ITAES)',
                            ].map(item => (
                                <div key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', padding: '2px 0' }}>
                                    <span style={{ color: '#2980B9', fontWeight: 700, fontSize: '0.75rem', flexShrink: 0, marginTop: '2px' }}>✓</span>
                                    <span style={{ fontSize: '0.78rem', color: '#334155' }}>{item}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Botón de descarga */}
                    <button
                        id="btn-descargar-manual"
                        onClick={handleDownload}
                        disabled={loading}
                        style={{
                            width: '100%',
                            padding: '14px 24px',
                            background: done
                                ? 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)'
                                : 'linear-gradient(135deg, #1E5799 0%, #2980B9 100%)',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '12px',
                            fontSize: '0.95rem',
                            fontWeight: 700,
                            cursor: loading ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '10px',
                            transition: 'all 0.3s ease',
                            opacity: loading ? 0.85 : 1,
                            boxShadow: '0 4px 16px rgba(30,87,153,0.3)',
                            letterSpacing: '0.01em',
                        }}
                        onMouseOver={e => {
                            if (!loading) e.currentTarget.style.boxShadow = '0 6px 24px rgba(30,87,153,0.45)';
                        }}
                        onMouseOut={e => {
                            e.currentTarget.style.boxShadow = '0 4px 16px rgba(30,87,153,0.3)';
                        }}
                    >
                        {loading ? (
                            <>
                                <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
                                Generando PDF...
                            </>
                        ) : done ? (
                            <>
                                <CheckCircle2 size={20} />
                                ¡PDF Descargado Exitosamente!
                            </>
                        ) : (
                            <>
                                <Download size={20} />
                                Descargar Manual — Manual_ADM-QUI_v1.0.pdf
                            </>
                        )}
                    </button>

                    {done && (
                        <p style={{
                            textAlign: 'center',
                            marginTop: '12px',
                            fontSize: '0.8rem',
                            color: '#16A34A',
                            fontWeight: 600,
                        }}>
                            ✓ El archivo se ha guardado en tu carpeta de Descargas
                        </p>
                    )}
                </div>
            </div>

            {/* Card informativo ITAES */}
            <div style={{
                width: '100%',
                maxWidth: '760px',
                marginTop: '20px',
                background: '#FFFBEB',
                border: '1px solid #FCD34D',
                borderRadius: '12px',
                padding: '16px 20px',
                display: 'flex',
                gap: '12px',
                alignItems: 'flex-start',
            }}>
                <FileText size={18} color="#D97706" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                    <p style={{ margin: '0 0 4px', fontSize: '0.82rem', fontWeight: 700, color: '#92400E' }}>
                        Documento para Aprobación — Departamento de Calidad
                    </p>
                    <p style={{ margin: 0, fontSize: '0.78rem', color: '#78350F', lineHeight: 1.5 }}>
                        Una vez descargado, este manual debe ser presentado al Departamento de Calidad para su revisión y posterior aprobación por la Dirección Médica. La versión firmada debe ser archivada conforme al sistema de gestión documental institucional (ITAES). Código del documento: <strong>ADM-QUI-MP-001</strong>.
                    </p>
                </div>
            </div>

            <style>{`
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
}
