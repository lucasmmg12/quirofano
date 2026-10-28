/**
 * epidemiologiaReportPdf.js — Generador de Informes Epidemiológicos y Científicos
 * Estilo Editorial: Revista Médica / Asociaciones Científicas / Sanatorio Argentino
 * 
 * - Encabezado institucional azul marino (#0D3B66) con acento (#3B82F6)
 * - Logotipo circular oficial del Sanatorio Argentino
 * - Tipografía limpia, abstract metodológico y matriz epidemiológica
 * - Tabla autoTable estilizada para Planilla C2 / SNVS y casos nominales
 * - Numeración de páginas "Página X de Y" y pie institucional
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { installSafePdfText } from './gobernanzaServiceProjectPdf';

const COLORS = {
    navyHeader: [13, 59, 102],     // #0D3B66 — Azul Marino Institucional
    accentBlue: [59, 130, 246],    // #3B82F6 — Azul de acento editorial
    darkText: [30, 41, 59],        // #1E293B — Texto principal
    mutedText: [100, 116, 139],    // #64748B — Subtítulos y metadatos
    lightBg: [248, 250, 252],      // #F8FAFC — Cajas de resumen
    borderColor: [226, 232, 240],  // #E2E8F0 — Bordes
    tableHeader: [15, 41, 66],     // #0F2942
    tableRowAlt: [248, 250, 252],  // #F8FAFC
    white: [255, 255, 255],
    green: [16, 185, 129],
    amber: [217, 119, 6],
    red: [220, 38, 38]
};

let cachedLogoBase64 = null;

async function getCircularLogoBase64() {
    if (cachedLogoBase64) return cachedLogoBase64;
    try {
        const logoImg = new Image();
        logoImg.crossOrigin = 'anonymous';
        logoImg.src = '/logosanatorio.png';
        await new Promise((resolve, reject) => {
            logoImg.onload = resolve;
            logoImg.onerror = reject;
        });

        const canvas = document.createElement('canvas');
        canvas.width = 200;
        canvas.height = 200;
        const ctx = canvas.getContext('2d');
        ctx.beginPath();
        ctx.arc(100, 100, 100, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(logoImg, 0, 0, 200, 200);

        cachedLogoBase64 = canvas.toDataURL('image/png');
        return cachedLogoBase64;
    } catch {
        return null;
    }
}

/**
 * Genera el PDF del Informe Epidemiológico Clínico
 */
export async function exportEpidemiologiaReportPdf({
    fechaDesde,
    fechaHasta,
    periodoLabel,
    kpis,
    casos,
    serieMensual
}) {
    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
    });
    installSafePdfText(doc);

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;
    const contentWidth = pageWidth - (margin * 2);

    // ─── 1. HEADER INSTITUCIONAL EDITORIAL ───
    doc.setFillColor(...COLORS.navyHeader);
    doc.rect(0, 0, pageWidth, 28, 'F');

    // Línea de acento inferior
    doc.setFillColor(...COLORS.accentBlue);
    doc.rect(0, 28, pageWidth, 2, 'F');

    // Logo Institucional
    const logoBase64 = await getCircularLogoBase64();
    if (logoBase64) {
        try {
            doc.addImage(logoBase64, 'PNG', margin, 4, 20, 20);
        } catch {}
    }

    // Textos del Header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(...COLORS.white);
    doc.text('SANATORIO ARGENTINO', margin + 24, 12);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(200, 220, 245);
    doc.text('COMITÉ DE EPIDEMIOLOGÍA, CONTROL DE INFECCIONES Y GOBERNANZA DE DATOS', margin + 24, 18);
    doc.text('BOLETÍN CLÍNICO Y VIGILANCIA DE ENFERMEDADES DE NOTIFICACIÓN OBLIGATORIA (SNVS / C2)', margin + 24, 23);

    // ─── 2. TÍTULO CIENTÍFICO Y METADATOS ───
    let currentY = 38;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...COLORS.navyHeader);
    doc.text('INFORME EPIDEMIOLÓGICO Y DE VIGILANCIA CLÍNICA', margin, currentY);

    currentY += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...COLORS.mutedText);
    const fechaEmision = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' });
    doc.text(`Período Auditado: ${periodoLabel || `${fechaDesde} al ${fechaHasta}`}   |   Emisión: ${fechaEmision}   |   San Juan, Argentina`, margin, currentY);

    currentY += 8;

    // ─── 3. ABSTRACT / RESUMEN METODOLÓGICO ───
    doc.setFillColor(...COLORS.lightBg);
    doc.setDrawColor(...COLORS.borderColor);
    doc.roundedRect(margin, currentY, contentWidth, 24, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.accentBlue);
    doc.text('RESUMEN EJECUTIVO & DIRECTRICES DE VIGILANCIA (PLANILLA C2):', margin + 4, currentY + 5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...COLORS.darkText);
    const abstractText = 'El presente informe consolida los eventos clínicos bajo vigilancia epidemiológica activa en Sanatorio Argentino de acuerdo a las directrices del Sistema Nacional de Vigilancia de la Salud (SNVS). Incluye monitoreo continuo de Bronquiolitis aguda en lactantes y niños menores de 2 años (<24 meses), Infecciones Respiratorias Agudas (ETI y Neumonías), Patología Gastroentérica (Diarreas Agudas), Enfermedades Inmunoprevenibles (Varicela) e Infecciones de Transmisión Sexual (ETS/ITS). Los datos corresponden a atenciones efectivas registradas en historia clínica electrónica SALUS.';
    const splitAbstract = doc.splitTextToSize(abstractText, contentWidth - 8);
    doc.text(splitAbstract, margin + 4, currentY + 10);

    currentY += 28;

    // ─── 4. MATRIZ DE INDICADORES EPIDEMIOLÓGICOS ───
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...COLORS.navyHeader);
    doc.text('1. Consolidado de Patologías Vigiladas en el Período', margin, currentY);
    currentY += 4;

    const tablaIndicadoresBody = [
        ['Bronquiolitis Aguda en Menores de 2 Años', 'CIE-10 J21.0, J21.9 (< 24 meses)', `${kpis.bronquiolitisMes} casos`, 'Vigilancia pediátrica / VRS', 'Planilla C2 (Bajas)'],
        ['Infecciones Respiratorias: ETI (Gripe)', 'CIE-10 J10, J11 (Influenza)', `${kpis.etiMes} casos`, 'Canal endémico invernal', 'Planilla C2 (ETI)'],
        ['Infecciones Respiratorias: Neumonías', 'CIE-10 J12-J18', `${kpis.neumoniaMes} casos`, 'Bacterianas y atípicas', 'Planilla C2 (Neumonía)'],
        ['Gastroenteritis y Diarreas Agudas', 'CIE-10 A08, A09, K52', `${kpis.diarreasMes} casos`, 'Patología digestiva aguda', 'Planilla C2 (Diarreas)'],
        ['Varicela sin complicaciones / complicada', 'CIE-10 B01.9', `${kpis.varicelaMes} casos`, 'Inmunoprevenible / Brotes', 'Planilla C2 (Eruptivas)'],
        ['Infecciones de Transmisión Sexual (ETS)', 'CIE-10 A50-A56, B20, B07', `${kpis.etsMes} casos`, 'Salud sexual y reproductiva', 'Vigilancia ITS']
    ];

    autoTable(doc, {
        startY: currentY,
        head: [['Patología Notificable', 'Codificación CIE-10', 'Casos en Período', 'Objetivo Clínico', 'Rubro SNVS']],
        body: tablaIndicadoresBody,
        theme: 'grid',
        headStyles: {
            fillColor: COLORS.tableHeader,
            textColor: COLORS.white,
            fontSize: 7.5,
            fontStyle: 'bold',
            halign: 'left',
            cellPadding: 2.5
        },
        bodyStyles: {
            fontSize: 7,
            textColor: COLORS.darkText,
            cellPadding: 2.2
        },
        columnStyles: {
            0: { fontStyle: 'bold', width: 55 },
            1: { fontStyle: 'normal', width: 45 },
            2: { fontStyle: 'bold', halign: 'center', width: 25 },
            3: { width: 35 },
            4: { width: 22 }
        },
        margin: { left: margin, right: margin }
    });

    currentY = doc.lastAutoTable.finalY + 8;

    // ─── 5. REGISTRO NOMINAL DE CASOS DEL PERÍODO ───
    if (currentY > 210) {
        doc.addPage();
        currentY = 20;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...COLORS.navyHeader);
    doc.text(`2. Detalle Nominal de Casos Notificados (${casos.length} registros auditados)`, margin, currentY);
    currentY += 4;

    const tablaCasosHead = [['Fecha', 'NHC', 'Paciente', 'Edad', 'Diagnóstico Notificado', 'CIE-10', 'Servicio', 'Destino']];
    const tablaCasosBody = casos.map(c => [
        c.fecha ? c.fecha.substring(0, 16) : '-',
        c.nhc || '-',
        c.paciente || '-',
        c.grupoEtario || `${c.edadMeses ? Math.floor(c.edadMeses / 12) + 'a' : '-'}`,
        c.patologia || '-',
        c.cie10 || '-',
        c.servicio || 'Guardia',
        c.destino || 'Ambulatorio'
    ]);

    autoTable(doc, {
        startY: currentY,
        head: tablaCasosHead,
        body: tablaCasosBody.length > 0 ? tablaCasosBody : [['-', '-', 'No se registraron casos notificados en este período', '-', '-', '-', '-', '-']],
        theme: 'striped',
        headStyles: {
            fillColor: COLORS.navyHeader,
            textColor: COLORS.white,
            fontSize: 7,
            fontStyle: 'bold',
            halign: 'left',
            cellPadding: 2.5
        },
        bodyStyles: {
            fontSize: 6.8,
            textColor: COLORS.darkText,
            cellPadding: 2
        },
        columnStyles: {
            0: { width: 24 },
            1: { width: 14, fontStyle: 'bold' },
            2: { width: 38, fontStyle: 'bold' },
            3: { width: 16 },
            4: { width: 44 },
            5: { width: 14, fontStyle: 'bold', halign: 'center' },
            6: { width: 24 },
            7: { width: 22 }
        },
        margin: { left: margin, right: margin }
    });

    // ─── 6. PIE DE PÁGINA INSTITUCIONAL EN TODAS LAS HOJAS ───
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);

        // Barra inferior
        doc.setDrawColor(...COLORS.borderColor);
        doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(...COLORS.mutedText);
        doc.text('Sanatorio Argentino — Sistema de Gobernanza de Datos y Calidad Asistencial (QOAG)', margin, pageHeight - 7);
        doc.text(`Página ${i} de ${totalPages}`, pageWidth - margin, pageHeight - 7, { align: 'right' });
    }

    const filename = `Informe_Epidemiologico_${(periodoLabel || 'Periodo').replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
    doc.save(filename);
}
