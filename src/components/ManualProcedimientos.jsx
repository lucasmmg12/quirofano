/**
 * ManualProcedimientos.jsx
 * Manual de Procedimientos Operativos y Guía de Uso Integral — Sistema ADM-QUI
 * Estructura Oficial del Sistema de Gestión de la Calidad (SGC) / Normas ITAES
 * Sanatorio Argentino SRL
 * 
 * Tipografía: Montserrat
 * Elaborado por: Lucas Marinero (Responsable de Innovación y Transformación Digital)
 * Revisado por: Gabriela Iragorre (Responsable Documentos SGC)
 * Aprobado por: Dr. Carlos Buteler (Director Médico)
 */

import React, { useState } from 'react';
import {
    BookOpen, Download, Printer, Loader2, CheckCircle2, FileText,
    ArrowRight, Layers, Cpu, ShieldCheck, Activity, Users, HelpCircle,
    FileCheck2, Building, Stethoscope, AlertTriangle, Sparkles, MessageSquare,
    QrCode, Database, RefreshCw, Send, CheckSquare, Clock, Zap, CornerDownRight
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ─── Metadatos Institucionales Oficiales SGC ────────────────────────────────
export const DOC_META = {
    codigo: 'ITYS 23',
    revision: '01',
    version: '1.1',
    fechaVigencia: '27/08/2026',
    estado: 'Vigente — Aprobado SGC',
    titulo: 'SISTEMA ADM-QUI — MANUAL DE PROCEDIMIENTOS OPERATIVOS INTEGRALES',
    sistema: 'SISTEMA ADMINISTRACIÓN (ADM-QUI)',
    departamento: 'INNOVACIÓN Y TRANSFORMACIÓN DIGITAL',
    elaboro: 'Lucas Marinero',
    elaboroCargo: 'Responsable de Innovación y Transformación Digital',
    reviso: 'Gabriela Iragorre',
    revisoCargo: 'Responsable Documentos SGC',
    aprobo: 'Dr. Carlos Buteler',
    aproboCargo: 'Director Médico',
};

// ─── Paleta Institucional (RGB) ─────────────────────────────────────────────
const COLORS = {
    primary: [30, 87, 153],
    primaryMid: [41, 128, 185],
    primaryLight: [235, 243, 252],
    accent: [26, 82, 118],
    white: [255, 255, 255],
    grayLight: [245, 247, 250],
    grayMid: [189, 195, 199],
    grayDark: [52, 73, 94],
    textMain: [30, 39, 46],
    textSub: [86, 101, 115],
    tableHead: [235, 238, 242],
    boxBorder: [200, 210, 225],
};

function drawWatermark(doc) {
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    doc.saveGraphicsState();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(32);
    doc.setTextColor(242, 245, 249);
    doc.text('SANATORIO ARGENTINO', W / 2, H / 2, {
        align: 'center',
        angle: 45,
    });
    doc.restoreGraphicsState();
}

function drawHeader(doc, pageNum, totalPages) {
    const W = doc.internal.pageSize.getWidth();
    const CW = W - 28;
    const ML = 14;

    drawWatermark(doc);

    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.setTextColor(0, 0, 0);

    // Col 1: Logo + Sanatorio Argentino SRL + Departamento
    doc.rect(ML, 10, 48, 20, 'S');
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.text('SANATORIO', ML + 24, 14.5, { align: 'center' });
    doc.text('ARGENTINO SRL', ML + 24, 18, { align: 'center' });
    doc.line(ML + 4, 19.5, ML + 44, 19.5);
    doc.setFontSize(6.5);
    doc.text('INNOVACIÓN Y', ML + 24, 23.5, { align: 'center' });
    doc.text('TRANSFORMACIÓN DIGITAL', ML + 24, 27, { align: 'center' });

    // Col 2: Título Oficial
    doc.rect(ML + 48, 10, CW - 96, 20, 'S');
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.text('MANUAL DE PROCEDIMIENTOS OPERATIVOS:', ML + 52, 14.5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.8);
    const titleLines = doc.splitTextToSize(DOC_META.titulo, CW - 104);
    doc.text(titleLines, ML + 48 + ((CW - 96) / 2), 20.5, { align: 'center' });

    // Col 3: Código + Revisión + Paginación
    doc.rect(ML + CW - 48, 10, 48, 20, 'S');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(DOC_META.codigo, ML + CW - 24, 15.5, { align: 'center' });
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.text('Revisión Nº ' + DOC_META.revision, ML + CW - 24, 21.5, { align: 'center' });
    doc.setFontSize(7.5);
    doc.text(`Pág. ${pageNum} de ${totalPages || '{total_pages_count_string}'}`, ML + CW - 24, 27.5, { align: 'center' });

    // Fila Inferior: Advertencia de copia no controlada
    doc.setFillColor(235, 238, 242);
    doc.rect(ML, 30, CW, 5, 'FD');
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('VALIDO SOLO EN FORMATO ELECTRÓNICO – LAS COPIAS EN PAPEL CARECEN DE VALOR', ML + (CW / 2), 33.5, { align: 'center' });
}

function drawSignatures(doc, y = 254) {
    const W = doc.internal.pageSize.getWidth();
    const CW = W - 28;
    const ML = 14;
    const colW = CW / 3;
    const boxH = 26;

    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.setTextColor(0, 0, 0);

    doc.rect(ML, y, CW, boxH, 'S');
    doc.line(ML + colW, y, ML + colW, y + boxH);
    doc.line(ML + colW * 2, y, ML + colW * 2, y + boxH);

    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text('ELABORADO:', ML + 2, y + 4.5);
    doc.text('REVISADO:', ML + colW + 2, y + 4.5);
    doc.text('APROBADO:', ML + colW * 2 + 2, y + 4.5);

    // Elaborado: Lucas Marinero
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.text(DOC_META.elaboro, ML + colW / 2, y + 16, { align: 'center' });
    doc.setFontSize(6.8);
    doc.setFont('helvetica', 'normal');
    doc.text('Responsable de Innovación y', ML + colW / 2, y + 20, { align: 'center' });
    doc.text('Transformación Digital', ML + colW / 2, y + 23.5, { align: 'center' });

    // Revisado: Gabriela Iragorre
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.text(DOC_META.reviso, ML + colW + colW / 2, y + 16, { align: 'center' });
    doc.setFontSize(6.8);
    doc.setFont('helvetica', 'normal');
    doc.text(DOC_META.revisoCargo, ML + colW + colW / 2, y + 20.5, { align: 'center' });

    // Aprobado: Dr. Carlos Buteler
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.text(DOC_META.aprobo, ML + colW * 2 + colW / 2, y + 16, { align: 'center' });
    doc.setFontSize(6.8);
    doc.setFont('helvetica', 'normal');
    doc.text(DOC_META.aproboCargo, ML + colW * 2 + colW / 2, y + 20.5, { align: 'center' });
}

function addPage(doc, counters) {
    drawSignatures(doc, 254);
    doc.addPage();
    counters.page += 1;
    drawHeader(doc, counters.page, '{total_pages_count_string}');
    return 38;
}

function checkPageBreak(doc, counters, y, neededHeight = 15) {
    if (y + neededHeight > 250) {
        return addPage(doc, counters);
    }
    return y;
}

function sectionTitle(doc, text, y) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(0, 0, 0);
    doc.text(text.toUpperCase(), 14, y + 4.5);
    return y + 7.5;
}

function subTitle(doc, text, y) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(30, 87, 153);
    doc.text(text, 14 + 2, y + 4);
    return y + 6.5;
}

function para(doc, text, y, indent = 14) {
    const W = doc.internal.pageSize.getWidth();
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.textMain);
    const lines = doc.splitTextToSize(text, W - indent - 14);
    doc.text(lines, indent, y);
    return y + lines.length * 3.8 + 1.5;
}

function bulletList(doc, items, y, indent = 20) {
    const W = doc.internal.pageSize.getWidth();
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.textMain);
    for (const item of items) {
        doc.setFillColor(...COLORS.primaryMid);
        doc.circle(indent - 4, y - 1, 0.7, 'F');
        const lines = doc.splitTextToSize(item, W - indent - 14);
        doc.text(lines, indent, y);
        y += lines.length * 3.8 + 1;
    }
    return y + 1.5;
}

function stepList(doc, items, y, indent = 20) {
    const W = doc.internal.pageSize.getWidth();
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.textMain);
    for (let i = 0; i < items.length; i++) {
        const num = `${i + 1}.`;
        doc.setFont('helvetica', 'bold');
        doc.text(num, indent - 6, y);
        doc.setFont('helvetica', 'normal');
        const lines = doc.splitTextToSize(items[i], W - indent - 14);
        doc.text(lines, indent, y);
        y += lines.length * 3.8 + 1.2;
    }
    return y + 1.5;
}

function noteBox(doc, text, y) {
    const W = doc.internal.pageSize.getWidth();
    const CW = W - 28;
    const ML = 14;
    let lines = doc.splitTextToSize(text, CW - 12);
    const boxH = lines.length * 3.8 + 7;

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.rect(ML, y, CW, boxH, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(30, 87, 153);
    doc.text('[PAUTA DE CONTROL / AUDITORÍA SGC]', ML + 4, y + 4.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    doc.text(lines, ML + 4, y + 8.5);
    return y + boxH + 3;
}

/**
 * Dibuja una caja de diagrama de flujo de proceso en el PDF
 */
function drawFlowBox(doc, text, x, y, w, h, bg = [240, 245, 255], border = [30, 87, 153]) {
    doc.setFillColor(...bg);
    doc.setDrawColor(...border);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, w, h, 2, 2, 'FD');
    doc.setFontSize(7.2);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 39, 46);
    const lines = doc.splitTextToSize(text, w - 4);
    const textY = y + (h / 2) - ((lines.length - 1) * 2);
    doc.text(lines, x + (w / 2), textY, { align: 'center' });
}

function drawFlowArrow(doc, x1, y1, x2, y2) {
    doc.setDrawColor(30, 87, 153);
    doc.setLineWidth(0.4);
    doc.line(x1, y1, x2, y2);
    // Punta de flecha
    doc.setFillColor(30, 87, 153);
    if (x1 === x2) {
        // Vertical
        doc.triangle(x2 - 1.5, y2 - 2, x2 + 1.5, y2 - 2, x2, y2, 'FD');
    } else {
        // Horizontal
        doc.triangle(x2 - 2, y2 - 1.5, x2 - 2, y2 + 1.5, x2, y2, 'FD');
    }
}

/**
 * Generador exhaustivo del Manual de Procedimientos en PDF
 */
export async function generateManualPDF() {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const counters = { page: 1 };
    
    // ── Página 1: Encabezado + Tablas de Control + Secciones 1 a 4 ──
    drawHeader(doc, 1, '{total_pages_count_string}');
    let y = 37;

    // Tabla 1: REVISIONES
    autoTable(doc, {
        startY: y,
        margin: { left: 14, right: 14 },
        head: [
            [{ content: 'CONTROL DE REVISIONES Y ACTUALIZACIONES SGC', colSpan: 4, styles: { halign: 'left', fillColor: [235, 238, 242], textColor: [0, 0, 0], fontStyle: 'bold' } }],
            ['N°', 'Descripción de los cambios', 'Autor', 'Fecha vigencia']
        ],
        body: [
            ['00', 'Versión original del sistema de admisión quirúrgica y triage', 'Lucas Marinero', '20/03/2024'],
            ['01', 'Revisión integral: Módulos de Altas, 042 Particulares, Facturación, Turnos, Beto IA, Laboratorios y Devoluciones', 'Lucas Marinero', DOC_META.fechaVigencia]
        ],
        theme: 'plain',
        headStyles: { fontSize: 7, fontStyle: 'bold', fillColor: [245, 247, 250], textColor: [0, 0, 0], halign: 'center', lineWidth: 0.3, lineColor: [0, 0, 0] },
        bodyStyles: { fontSize: 7, textColor: [0, 0, 0], lineWidth: 0.3, lineColor: [0, 0, 0] },
        columnStyles: {
            0: { halign: 'center', cellWidth: 10 },
            1: { cellWidth: 100 },
            2: { halign: 'center', cellWidth: 44 },
            3: { halign: 'center', cellWidth: 28 },
        },
        styles: { cellPadding: 1.5 }
    });

    y = doc.lastAutoTable.finalY + 3.5;

    // Tabla 2: DOCUMENTOS DE REFERENCIA
    autoTable(doc, {
        startY: y,
        margin: { left: 14, right: 14 },
        head: [
            [{ content: 'DOCUMENTOS DE REFERENCIA INSTITUCIONAL', colSpan: 2, styles: { halign: 'left', fillColor: [235, 238, 242], textColor: [0, 0, 0], fontStyle: 'bold' } }],
            ['Código', 'Título del documento']
        ],
        body: [
            ['SGC-PR-01', 'Manual del Sistema de Gestión de la Calidad (SGC) — Sanatorio Argentino'],
            ['ITAES-EST-04', 'Estándares de Acreditación de Establecimientos de Salud — ITAES'],
            ['ITYS-05', 'Procedimiento Operativo de Seguridad, Acceso y Confidencialidad en Sistemas'],
            ['ADM-QUI-02', 'Procedimiento de Admisión Quirúrgica y Circuito de Triage de Fojas']
        ],
        theme: 'plain',
        headStyles: { fontSize: 7, fontStyle: 'bold', fillColor: [245, 247, 250], textColor: [0, 0, 0], halign: 'center', lineWidth: 0.3, lineColor: [0, 0, 0] },
        bodyStyles: { fontSize: 7, textColor: [0, 0, 0], lineWidth: 0.3, lineColor: [0, 0, 0] },
        columnStyles: {
            0: { halign: 'center', cellWidth: 40 },
            1: { cellWidth: 142 },
        },
        styles: { cellPadding: 1.5 }
    });

    y = doc.lastAutoTable.finalY + 4;

    // 1. OBJETIVO
    y = sectionTitle(doc, '1. OBJETIVO DEL MANUAL:', y);
    y = para(doc, 'Establecer los procedimientos operativos estandarizados, responsabilidades funcionales y pautas de control para la totalidad de módulos que conforman el Sistema de Admisión Quirúrgica y Control Administrativo (ADM-QUI) del Sanatorio Argentino. Este manual sirve de guía de trabajo obligatoria para todo el personal asistencial y administrativo, garantizando la trazabilidad de historias clínicas, la precisión en facturación y el cumplimiento de las normativas de acreditación hospitalaria ITAES.', y);

    // 2. CAMPO DE APLICACIÓN
    y = checkPageBreak(doc, counters, y, 20);
    y = sectionTitle(doc, '2. CAMPO DE APLICACIÓN Y ALCANCE:', y);
    y = para(doc, 'Este manual es de aplicación directa y obligatoria para las áreas de: Innovación y Transformación Digital, Admisión Central y Quirúrgica, Recepción y Gestión de Turnos, Control de Altas Administrativas, Facturación Internado, Quirófanos Centrales, Laboratorios de Anatomía Patológica, Auditoría Médica y Recuperación de Cuentas del Sanatorio Argentino SRL.', y);

    // 3. DEFINICIONES
    y = checkPageBreak(doc, counters, y, 30);
    y = sectionTitle(doc, '3. DEFINICIONES Y GLOSARIO DE TÉRMINOS:', y);
    y = bulletList(doc, [
        'ADM-QUI: Plataforma web integral para gestión de admisiones quirúrgicas, turnos, altas y facturación.',
        'SALUS: Sistema hospitalario central (SQL Server) fuente de datos demográficos y de internación.',
        'BETO IA: Asistente virtual con Inteligencia Artificial integrado exclusivamente a ADM-QUI para soporte y analítica.',
        'CONTROL DE ALTAS: Auditoría administrativa previa al traspaso de expedientes hospitalarios a Facturación.',
        'PARTICULAR (042): Paciente sin cobertura de obra social o con cliente registrado con su propio nombre.',
        'REMITO DE TRASPASO: Acta digital formal con código oficial (TRASP-YYYYMMDD-XXXX) y firmas de entrega y recepción.',
        'REMITO DE DEVOLUCIÓN: Constancia digital de rechazo de ficha desde Facturación hacia Control de Altas.',
        'TRIAGE DE FOJA: Análisis y detección inteligente de insumos protésicos y biopsias desde fojas quirúrgicas.',
        'META CLOUD API: Protocolo oficial de mensajería empresarial de WhatsApp sujeto a la ventana de 24 horas.',
        'LUP (Lección de Un Punto): Documento instructivo focalizado en un único procedimiento específico.',
        'ITAES: Instituto Técnico para la Acreditación de Establecimientos de Salud.'
    ], y);

    // 4. ARQUITECTURA
    y = checkPageBreak(doc, counters, y, 30);
    y = sectionTitle(doc, '4. ARQUITECTURA GENERAL Y ACCESO AL SISTEMA:', y);
    y = para(doc, 'El sistema opera bajo arquitectura moderna cloud-edge conectada en tiempo real mediante Supabase (PostgreSQL) y el servicio local de sincronización con SALUS:', y);
    y = bulletList(doc, [
        'Acceso de Usuarios: Inicio de sesión mediante usuario institucional o correo @sanatorioargentino.com.ar.',
        'Atajo de Teclado Global: Combinación [Ctrl + K] para abrir la Paleta de Comandos y asistente Beto IA.',
        'Configuración de Módulos (Onboarding): Cada colaborador personaliza los accesos visibles según su perfil de trabajo en Ajustes.',
        'Seguridad y Cierre de Sesión: La sesión se gestiona con cifrado y se cierra automáticamente tras inactividad prolongada.'
    ], y);

    // ── 5. DIAGRAMA GENERAL DE FLUJO DEL SISTEMA ──
    y = checkPageBreak(doc, counters, y, 40);
    y = sectionTitle(doc, '5. DIAGRAMA GENERAL DE FLUJO DEL SISTEMA ADM-QUI:', y);
    
    // Dibujo de Diagrama de Flujo General
    const boxW = 50;
    const boxH = 10;
    drawFlowBox(doc, '1. Sincronización SALUS\n(SQL Server en Tiempo Real)', 14, y + 2, boxW, boxH, [235, 243, 252]);
    drawFlowArrow(doc, 14 + boxW, y + 7, 78, y + 7);
    drawFlowBox(doc, '2. Admisión y Turnos\n(Tótem Kiosco y Boxes)', 78, y + 2, boxW, boxH, [240, 253, 244], [16, 185, 129]);
    drawFlowArrow(doc, 78 + boxW, y + 7, 142, y + 7);
    drawFlowBox(doc, '3. Cirugías y Triage\n(WhatsApp y Foja Quirúrgica)', 142, y + 2, boxW, boxH, [254, 243, 199], [245, 158, 11]);

    drawFlowArrow(doc, 167, y + 12, 167, y + 18);
    drawFlowBox(doc, '4. Control de Altas\n(042 Particulares y Remito TRASP)', 142, y + 18, boxW, boxH, [245, 243, 255], [139, 92, 246]);
    drawFlowArrow(doc, 142, y + 23, 128, y + 23);
    drawFlowBox(doc, '5. Facturación Internado\n(Detección SALUS / Devoluciones)', 78, y + 18, boxW, boxH, [255, 241, 242], [239, 68, 68]);
    drawFlowArrow(doc, 78, y + 23, 64, y + 23);
    drawFlowBox(doc, '6. Beto IA & Métricas\n(Auditoría y Reportes PDF)', 14, y + 18, boxW, boxH, [235, 243, 252]);

    y += 34;

    // ── 6. PROCEDIMIENTOS DETALLADOS MÓDULO A MÓDULO ──
    y = checkPageBreak(doc, counters, y, 20);
    y = sectionTitle(doc, '6. PROCEDIMIENTOS OPERATIVOS POR MÓDULO (GUÍA PASO A PASO):', y);

    // 6.1 CIRUGÍAS Y TRIAGE
    y = checkPageBreak(doc, counters, y, 45);
    y = subTitle(doc, '6.1 MÓDULO DE CIRUGÍAS Y TRIAGE QUIRÚRGICO (SurgeriesPanel)', y);
    y = para(doc, 'Centraliza la programación quirúrgica diaria importada desde SALUS. Permite auditar el cumplimiento prequirúrgico y la correcta documentación médica.', y);
    
    // Diagrama de pipeline quirúrgico
    drawFlowBox(doc, 'Lila: Sin Mensaje\n(Verificar Teléfono)', 14, y + 2, 32, 9, [243, 232, 255], [168, 85, 247]);
    drawFlowArrow(doc, 46, y + 6.5, 50, y + 6.5);
    drawFlowBox(doc, 'Amarillo: En Revisión\n(Esperando Órdenes)', 50, y + 2, 32, 9, [254, 243, 199], [245, 158, 11]);
    drawFlowArrow(doc, 82, y + 6.5, 86, y + 6.5);
    drawFlowBox(doc, 'Verde: Autorizada\n(Cobertura Validada)', 86, y + 2, 32, 9, [240, 253, 244], [16, 185, 129]);
    drawFlowArrow(doc, 118, y + 6.5, 122, y + 6.5);
    drawFlowBox(doc, 'Azul: Confirmada\n(Paciente en Quirófano)', 122, y + 2, 32, 9, [235, 243, 252], [30, 87, 153]);
    drawFlowArrow(doc, 154, y + 6.5, 158, y + 6.5);
    drawFlowBox(doc, 'Rojo: Alerta / Susp.\n(Reprogramación)', 158, y + 2, 32, 9, [254, 242, 242], [239, 68, 68]);
    y += 15;

    y = para(doc, 'Procedimiento Paso a Paso para Triage de Fojas Quirúrgicas:', y);
    y = stepList(doc, [
        'Localizar al paciente en el listado de cirugías del día y hacer clic en el botón "Ver Foja / Cargar Foja".',
        'Cargar el archivo PDF o imagen del parte quirúrgico firmado por el cirujano y anestesiólogo.',
        'El motor de IA extrae automáticamente insumos implantados (mallas, prótesis, suturas) y piezas anatómicas.',
        'Verificar la coincidencia de los ítems detectados con la documentación física y confirmar el guardado.',
        'Si se detecta toma de biopsia, remitir automáticamente la muestra al Módulo de Laboratorios.'
    ], y);
    y = noteBox(doc, 'Toda intervención que utilice material protésico o de osteosíntesis debe tener adjunto el sticker de trazabilidad y número de lote escaneado junto a la foja.', y);

    // 6.2 COLA DE TURNOS
    y = checkPageBreak(doc, counters, y, 45);
    y = subTitle(doc, '6.2 MÓDULO DE COLA DE TURNOS Y BOXES DE RECEPCIÓN (TurnoAdminPanel)', y);
    y = para(doc, 'Administra la atención presencial de pacientes en la sede central mediante tótem interactivo y llamador acústico.', y);
    
    drawFlowBox(doc, 'Paso 1: Tótem Kiosco\nPaciente saca ticket A/Q/C/G/E', 14, y + 2, 54, 9, [240, 253, 244], [16, 185, 129]);
    drawFlowArrow(doc, 68, y + 6.5, 78, y + 6.5);
    drawFlowBox(doc, 'Paso 2: Llamador Central\nCampana + Voz Box 1-8', 78, y + 2, 54, 9, [235, 243, 252], [30, 87, 153]);
    drawFlowArrow(doc, 132, y + 6.5, 142, y + 6.5);
    drawFlowBox(doc, 'Paso 3: Box Recepción\nAtención y Cierre de Turno', 142, y + 2, 54, 9, [254, 243, 199], [245, 158, 11]);
    y += 15;

    y = stepList(doc, [
        'Operación de Kiosco: El paciente pulsa en la pantalla táctil su categoría (Admisión General, Quirófano, Consultas, Guardias, Entrega de Estudios) y retira su ticket numerado.',
        'Llamado desde Box: El personal de recepción ingresa al panel, selecciona su Box asignado (1 al 8) y hace clic en "Llamar Siguiente".',
        'Anuncio en Pantalla Central: El sistema emite campana sonora y locución automática indicando turno y Box.',
        'Atención y Cierre: Se marca el turno como "Atendiendo", luego "Finalizado". Si el paciente no se presenta tras 3 llamados, se marca "Ausente".'
    ], y);

    // 6.3 CONTROL DE ALTAS ADMINISTRATIVAS
    y = checkPageBreak(doc, counters, y, 45);
    y = subTitle(doc, '6.3 MÓDULO DE CONTROL DE ALTAS ADMINISTRATIVAS (AltasPanel)', y);
    y = para(doc, 'Auditoría obligatoria previa al traspaso de historias clínicas internadas a Facturación.', y);
    
    drawFlowBox(doc, '1. Auditoría de Admisión\n(042 Particular / Duplicados)', 14, y + 2, 54, 9, [235, 243, 252], [30, 87, 153]);
    drawFlowArrow(doc, 68, y + 6.5, 78, y + 6.5);
    drawFlowBox(doc, '2. Carrito de Traspaso\n(Selección Fichas Alta Adm)', 78, y + 2, 54, 9, [245, 243, 255], [139, 92, 246]);
    drawFlowArrow(doc, 132, y + 6.5, 142, y + 6.5);
    drawFlowBox(doc, '3. Remito TRASP y Firmas\n(Pase Digital a Facturación)', 142, y + 2, 54, 9, [240, 253, 244], [16, 185, 129]);
    y += 15;

    y = bulletList(doc, [
        'Paginación Ágil: Visualización predeterminada de a 10 registros por página para máxima velocidad de auditoría.',
        'Mapeo Automático de Particulares: Si el cliente es "042 - PARTICULARES" o coincide con el nombre del paciente, el sistema asigna automáticamente el estado "Particular".',
        'Fusión de Admisiones Duplicadas: Admisiones con la misma fecha de ingreso y paciente se agrupan en una única fila indicando el badge [🔗 Fusionada].',
        'Control de Cruza Mes: Pacientes con internación prolongada que traspasan el mes calendario se auditan con alertas de cierre parcial.',
        'Garantías y Pagarés: Registro de pagarés y comprobantes de depósito para pacientes sin cobertura integral.'
    ], y);
    y = para(doc, 'Procedimiento para Generar el Remito de Traspaso:', y);
    y = stepList(doc, [
        'Filtrar por mes y seleccionar las fichas en estado "Alta Adm" mediante las casillas de verificación.',
        'Presionar "Generar Traspaso" para desplegar el modal con el resumen nominal de pacientes.',
        'Ingresar los nombres de quien entrega (Admisión) y quien recibe (Facturación).',
        'Capturar ambas firmas digitales sobre la pantalla táctil.',
        'El sistema genera el código oficial TRASP-YYYYMMDD-XXXX, emite el PDF firmado y transfiere las fichas a la bandeja de Facturación.'
    ], y);

    // 6.4 FACTURACIÓN INTERNADO
    y = checkPageBreak(doc, counters, y, 45);
    y = subTitle(doc, '6.4 MÓDULO DE FACTURACIÓN INTERNADO Y DEVOLUCIONES (FacturacionPanel)', y);
    y = para(doc, 'Espacio de liquidación hospitalaria para auditar y facturar los expedientes transferidos desde Altas.', y);
    
    drawFlowBox(doc, '1. Ficha Recibida de Altas\n(Asignación a Analista)', 14, y + 2, 54, 9, [245, 243, 255], [139, 92, 246]);
    drawFlowArrow(doc, 68, y + 6.5, 78, y + 6.5);
    drawFlowBox(doc, '2A. Facturación SALUS\n(Detección Auto PDV 21/31)', 78, y + 2, 54, 9, [240, 253, 244], [16, 185, 129]);
    drawFlowArrow(doc, 132, y + 6.5, 142, y + 6.5);
    drawFlowBox(doc, '2B. Devolución a Altas\n(Remito con Motivo Formal)', 142, y + 2, 54, 9, [254, 242, 242], [239, 68, 68]);
    y += 15;

    y = bulletList(doc, [
        'Asignación de Analistas: Distribución nominal de fichas a liquidadores (Jorge Terrera, Paola Illanes, Inés Dona, etc.).',
        'Detección Automática de SALUS: Monitoreo de facturas emitidas en puntos de venta 21 y 31. Al facturar en SALUS, el sistema actualiza automáticamente a "Facturada" con número de comprobante.',
        'Circuito de Devolución a Altas: Si una historia clínica presenta faltantes (sin firma médica, orden no autorizada), se añade al Carrito de Devolución indicando motivo específico y se genera Remito de Devolución firmado.',
        'Historial de Devoluciones: Pestaña con bitácora inmutable de todas las devoluciones emitidas con fecha, hora y motivo.'
    ], y);

    // 6.5 DEUDAS Y PRESUPUESTOS
    y = checkPageBreak(doc, counters, y, 35);
    y = subTitle(doc, '6.5 MÓDULO DE DEUDAS Y PRESUPUESTOS QUIRÚRGICOS (DeudasPanel / PresupuestosPanel)', y);
    y = para(doc, 'Herramientas financieras para recuperación de saldos y emisión formal de cotizaciones quirúrgicas.', y);
    y = stepList(doc, [
        'Gestión de Deudas: Carga de coseguros pendientes, acuerdos en cuotas, cheques en cartera y recordatorios de pago por WhatsApp.',
        'Confección de Presupuestos: Desglose de derechos de quirófano, honorarios médicos y anestésicos, días de cama (piso/UTI) y descartables.',
        'Emisión y Envío PDF: Generación de presupuesto formal membretado con validez legal (15 a 30 días) y envío directo por WhatsApp.'
    ], y);

    // 6.6 MENSAJERÍA MULTILÍNEA Y WHATSAPP
    y = checkPageBreak(doc, counters, y, 35);
    y = subTitle(doc, '6.6 MÓDULO DE MENSAJERÍA WHATSAPP MULTILÍNEA (MessagingPanel)', y);
    y = para(doc, 'Centro unificado de comunicaciones con pacientes a través de líneas autorizadas de Sanatorio Argentino.', y);
    y = bulletList(doc, [
        'Línea Estándar (BuilderBot): Para mensajería ágil y resolución de consultas operativas.',
        'Línea Meta Cloud API (Oficial): Cumplimiento estricto de la política de 24 horas. Pasado dicho plazo, el sistema exige utilizar plantillas HSM aprobadas.',
        'Template Manager: Plantillas institucionales con variables automáticas ({{nombre}}, {{fecha_cirugia}}, {{medico}}).'
    ], y);

    // 6.7 ASOCIACIONES, LABORATORIOS Y ACTIVOS QR
    y = checkPageBreak(doc, counters, y, 35);
    y = subTitle(doc, '6.7 ASOCIACIONES, LABORATORIOS DE PATOLOGÍA Y ACTIVOS MÉDICOS QR', y);
    y = para(doc, 'Módulos de trazabilidad externa y equipamiento técnico hospitalario:', y);
    y = bulletList(doc, [
        'Asociaciones Médicas: Agrupación gremial de fojas quirúrgicas y generación de actas de entrega en PDF.',
        'Laboratorios de Anatomía Patológica: Trazabilidad de biopsias derivadas (CEDAP, Agüero, Ríos, Cuyo) con reglas "Facturar" vs "Entregar" (constancia nominal firmada).',
        'Activos Médicos QR: Registro de aparatología médica (laparoscopía, electrobisturíes, respiradores) e impresión de etiquetas con código QR para inspección técnica y mantenimientos.'
    ], y);

    // 6.8 BETO IA, GUARDIAS Y AUDITORÍA HC
    y = checkPageBreak(doc, counters, y, 40);
    y = subTitle(doc, '6.8 ASISTENTE BETO IA, GUARDIAS AMBULATORIAS Y AUDITORÍA HC', y);
    y = bulletList(doc, [
        'Asistente Beto IA: Respuestas instantáneas sobre datos en lenguaje natural, reportes ejecutivos en PDF, exportación masiva a Excel y atajo global [Ctrl + K].',
        'Consultas de Guardia: Triage por código de gravedad (Rojo, Amarillo, Verde), auditoría de tiempos de espera y trazabilidad de pases a internación (~5.800 consultas/mes).',
        'Auditoría de Historias Clínicas: Control documental (consentimientos, fojas, anestesia, epicrisis) e informes de no conformidades para el Comité de Calidad ITAES.',
        'Gobernanza y Roles: Matriz de permisos de usuario y registro inmutable de auditoría (Activity Audit Log).'
    ], y);

    // ── 7. PLAN DE CONTINGENCIA ──
    y = checkPageBreak(doc, counters, y, 40);
    y = sectionTitle(doc, '7. PLAN DE CONTINGENCIA ANTE FALLAS DE SISTEMA:', y);
    y = para(doc, 'Ante contingencias técnicas imprevistas, el personal aplicará los siguientes protocolos aprobados por el SGC:', y);
    autoTable(doc, {
        startY: y,
        margin: { left: 14, right: 14 },
        head: [['Incidencia Técnica', 'Procedimiento de Contingencia Inmediato', 'Responsable']],
        body: [
            ['Caída de sync-server SALUS', 'Ejecutar script local "Actualizar SALUS.bat" y verificar log de conexión SQL', 'Operador / Innovación'],
            ['Corte de conectividad a Internet', 'Registrar admisiones en planillas de contingencia manual hasta restablecimiento', 'Personal de Admisión'],
            ['Expiración ventana 24hs WhatsApp', 'Utilizar exclusivamente plantillas oficiales HSM aprobadas en el módulo de Mensajería', 'Operador de Mensajería'],
            ['Falla de pantalla llamadora de turnos', 'Realizar llamado a viva voz indicando número de turno y Box correspondiente', 'Recepción Central'],
            ['Inconsistencia en facturación SALUS', 'Verificar correlatividad de comprobantes en PDV 21/31 y sincronizar altas', 'Facturación / Sistemas']
        ],
        theme: 'plain',
        headStyles: { fontSize: 7, fontStyle: 'bold', fillColor: [235, 238, 242], textColor: [0, 0, 0], halign: 'center', lineWidth: 0.3, lineColor: [0, 0, 0] },
        bodyStyles: { fontSize: 7, textColor: [0, 0, 0], lineWidth: 0.3, lineColor: [0, 0, 0] },
        columnStyles: {
            0: { fontStyle: 'bold', cellWidth: 48 },
            1: { cellWidth: 94 },
            2: { halign: 'center', cellWidth: 40 },
        },
        styles: { cellPadding: 1.8 }
    });

    y = doc.lastAutoTable.finalY + 4;
    y = checkPageBreak(doc, counters, y, 20);
    y = noteBox(doc, 'Este manual es de cumplimiento mandatorio. Toda revisión o modificación debe ser gestionada a través del Departamento de Innovación y Transformación Digital y aprobada formalmente por la Dirección Médica del Sanatorio Argentino SRL.', y);

    drawSignatures(doc, 254);

    doc.putTotalPages('{total_pages_count_string}');
    doc.save(`Manual_Operativo_${DOC_META.codigo.replace(/\s+/g, '_')}_ADM-QUI_v${DOC_META.version}.pdf`);
}

// ─── Componente React Principal con Tipografía Montserrat ────────────────────
export default function ManualProcedimientos() {
    const [activeTab, setActiveTab] = useState('manual'); // 'manual' | 'diagramas' | 'guia'
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
            alert('Error al generar el PDF. Verificar consola.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            minHeight: '100vh',
            background: '#F8FAFC',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            fontFamily: "'Montserrat', sans-serif"
        }}>
            {/* Barra Superior de Control */}
            <div style={{
                width: '100%',
                maxWidth: '960px',
                background: '#FFFFFF',
                borderRadius: '16px',
                padding: '18px 24px',
                boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
                border: '1px solid #E2E8F0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '20px',
                flexWrap: 'wrap',
                gap: '14px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{
                        width: '46px',
                        height: '46px',
                        borderRadius: '12px',
                        background: 'linear-gradient(135deg, #1E5799 0%, #2980B9 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#fff',
                        boxShadow: '0 4px 10px rgba(30,87,153,0.25)'
                    }}>
                        <BookOpen size={24} />
                    </div>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em' }}>
                            Manual de Procedimientos y Guía Operativa SGC
                        </h2>
                        <p style={{ margin: '2px 0 0 0', fontSize: '0.8rem', color: '#64748B', fontWeight: 500 }}>
                            Código: <strong>{DOC_META.codigo}</strong> • Revisión Nº {DOC_META.revision} • Estándar ITAES
                        </p>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                        display: 'flex',
                        background: '#F1F5F9',
                        borderRadius: '10px',
                        padding: '3px',
                        gap: '2px'
                    }}>
                        <button
                            onClick={() => setActiveTab('manual')}
                            style={{
                                padding: '7px 14px',
                                borderRadius: '8px',
                                border: 'none',
                                background: activeTab === 'manual' ? '#FFFFFF' : 'transparent',
                                color: activeTab === 'manual' ? '#1E5799' : '#64748B',
                                fontWeight: activeTab === 'manual' ? 700 : 600,
                                fontSize: '0.82rem',
                                cursor: 'pointer',
                                boxShadow: activeTab === 'manual' ? '0 1px 4px rgba(0,0,0,0.08)' : 'none'
                            }}
                        >
                            Documento SGC
                        </button>
                        <button
                            onClick={() => setActiveTab('diagramas')}
                            style={{
                                padding: '7px 14px',
                                borderRadius: '8px',
                                border: 'none',
                                background: activeTab === 'diagramas' ? '#FFFFFF' : 'transparent',
                                color: activeTab === 'diagramas' ? '#1E5799' : '#64748B',
                                fontWeight: activeTab === 'diagramas' ? 700 : 600,
                                fontSize: '0.82rem',
                                cursor: 'pointer',
                                boxShadow: activeTab === 'diagramas' ? '0 1px 4px rgba(0,0,0,0.08)' : 'none'
                            }}
                        >
                            Diagramas de Flujo
                        </button>
                        <button
                            onClick={() => setActiveTab('guia')}
                            style={{
                                padding: '7px 14px',
                                borderRadius: '8px',
                                border: 'none',
                                background: activeTab === 'guia' ? '#FFFFFF' : 'transparent',
                                color: activeTab === 'guia' ? '#1E5799' : '#64748B',
                                fontWeight: activeTab === 'guia' ? 700 : 600,
                                fontSize: '0.82rem',
                                cursor: 'pointer',
                                boxShadow: activeTab === 'guia' ? '0 1px 4px rgba(0,0,0,0.08)' : 'none'
                            }}
                        >
                            Guía Paso a Paso
                        </button>
                    </div>

                    <button
                        onClick={() => window.print()}
                        style={{
                            padding: '9px 16px',
                            background: '#F8FAFC',
                            color: '#334155',
                            border: '1px solid #CBD5E1',
                            borderRadius: '10px',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        <Printer size={16} /> Imprimir
                    </button>

                    <button
                        onClick={handleDownload}
                        disabled={loading}
                        style={{
                            padding: '9px 20px',
                            background: done ? '#16A34A' : 'linear-gradient(135deg, #1E5799 0%, #2980B9 100%)',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '10px',
                            fontSize: '0.85rem',
                            fontWeight: 700,
                            cursor: loading ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            boxShadow: '0 2px 8px rgba(30,87,153,0.25)'
                        }}
                    >
                        {loading ? (
                            <>
                                <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                                Generando PDF...
                            </>
                        ) : done ? (
                            <>
                                <CheckCircle2 size={16} />
                                ¡Descargado!
                            </>
                        ) : (
                            <>
                                <Download size={16} />
                                Descargar Manual PDF
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* TAB 1: Documento SGC Completo en Pantalla */}
            {activeTab === 'manual' && (
                <div style={{
                    width: '100%',
                    maxWidth: '960px',
                    background: '#FFFFFF',
                    borderRadius: '4px',
                    boxShadow: '0 8px 30px rgba(0,0,0,0.1)',
                    border: '1px solid #D1D5DB',
                    padding: '36px',
                    position: 'relative',
                    color: '#000000',
                    fontSize: '13px',
                    lineHeight: 1.6
                }}>
                    {/* Marca de agua */}
                    <div style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%) rotate(-45deg)',
                        fontSize: '68px',
                        fontWeight: 900,
                        color: 'rgba(0,0,0,0.03)',
                        whiteSpace: 'nowrap',
                        userSelect: 'none',
                        pointerEvents: 'none',
                        letterSpacing: '4px'
                    }}>
                        SANATORIO ARGENTINO
                    </div>

                    {/* Encabezado Oficial */}
                    <table style={{ width: '100%', borderCollapse: 'collapse', border: '1.5px solid #000', marginBottom: '16px' }}>
                        <tbody>
                            <tr>
                                <td style={{ border: '1.5px solid #000', width: '25%', padding: '8px', textAlign: 'center', verticalAlign: 'middle' }}>
                                    <div style={{ fontSize: '11px', fontWeight: 800, lineHeight: '1.2' }}>
                                        SANATORIO<br />ARGENTINO SRL
                                    </div>
                                    <hr style={{ border: 'none', borderTop: '1px solid #000', margin: '6px 0' }} />
                                    <div style={{ fontSize: '9px', fontWeight: 700, lineHeight: '1.2' }}>
                                        {DOC_META.departamento}
                                    </div>
                                </td>
                                <td style={{ border: '1.5px solid #000', width: '50%', padding: '8px', textAlign: 'center', verticalAlign: 'middle' }}>
                                    <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.05em' }}>MANUAL DE PROCEDIMIENTOS OPERATIVOS:</div>
                                    <div style={{ fontSize: '13px', fontWeight: 800, marginTop: '4px' }}>
                                        {DOC_META.titulo}
                                    </div>
                                </td>
                                <td style={{ border: '1.5px solid #000', width: '25%', padding: '8px', textAlign: 'center', verticalAlign: 'middle' }}>
                                    <div style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '0.05em' }}>{DOC_META.codigo}</div>
                                    <div style={{ fontSize: '11px', marginTop: '2px', fontWeight: 600 }}>Revisión Nº {DOC_META.revision}</div>
                                    <div style={{ fontSize: '10px', marginTop: '2px', color: '#4B5563' }}>Documento Institucional SGC</div>
                                </td>
                            </tr>
                            <tr>
                                <td colSpan={3} style={{ border: '1.5px solid #000', background: '#E5E7EB', padding: '4px', textAlign: 'center', fontSize: '10px', fontWeight: 800 }}>
                                    VALIDO SOLO EN FORMATO ELECTRÓNICO – LAS COPIAS EN PAPEL CARECEN DE VALOR
                                </td>
                            </tr>
                        </tbody>
                    </table>

                    {/* Revisiones */}
                    <table style={{ width: '100%', borderCollapse: 'collapse', border: '1.5px solid #000', marginBottom: '14px', fontSize: '11px' }}>
                        <thead>
                            <tr>
                                <th colSpan={4} style={{ border: '1px solid #000', background: '#E5E7EB', padding: '4px 8px', textAlign: 'left', fontWeight: 800 }}>
                                    CONTROL DE REVISIONES Y ACTUALIZACIONES SGC
                                </th>
                            </tr>
                            <tr style={{ background: '#F3F4F6' }}>
                                <th style={{ border: '1px solid #000', padding: '4px', width: '40px', textAlign: 'center', fontWeight: 700 }}>Nº</th>
                                <th style={{ border: '1px solid #000', padding: '4px', textAlign: 'left', fontWeight: 700 }}>Descripción de los cambios</th>
                                <th style={{ border: '1px solid #000', padding: '4px', width: '180px', textAlign: 'center', fontWeight: 700 }}>Autor</th>
                                <th style={{ border: '1px solid #000', padding: '4px', width: '110px', textAlign: 'center', fontWeight: 700 }}>Fecha vigencia</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center' }}>00</td>
                                <td style={{ border: '1px solid #000', padding: '4px 8px' }}>Versión original del sistema de admisión quirúrgica y triage</td>
                                <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center' }}>Lucas Marinero</td>
                                <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center' }}>20/03/2024</td>
                            </tr>
                            <tr>
                                <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center' }}>01</td>
                                <td style={{ border: '1px solid #000', padding: '4px 8px' }}>Revisión integral: Módulos de Altas, 042 Particulares, Facturación, Turnos, Beto IA, Laboratorios y Devoluciones</td>
                                <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center' }}>Lucas Marinero</td>
                                <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center' }}>{DOC_META.fechaVigencia}</td>
                            </tr>
                        </tbody>
                    </table>

                    {/* Referencias */}
                    <table style={{ width: '100%', borderCollapse: 'collapse', border: '1.5px solid #000', marginBottom: '20px', fontSize: '11px' }}>
                        <thead>
                            <tr>
                                <th colSpan={2} style={{ border: '1px solid #000', background: '#E5E7EB', padding: '4px 8px', textAlign: 'left', fontWeight: 800 }}>
                                    DOCUMENTOS DE REFERENCIA INSTITUCIONAL
                                </th>
                            </tr>
                            <tr style={{ background: '#F3F4F6' }}>
                                <th style={{ border: '1px solid #000', padding: '4px', width: '140px', textAlign: 'center', fontWeight: 700 }}>Código</th>
                                <th style={{ border: '1px solid #000', padding: '4px', textAlign: 'left', fontWeight: 700 }}>Título del documento</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center' }}>SGC-PR-01</td>
                                <td style={{ border: '1px solid #000', padding: '4px 8px' }}>Manual del Sistema de Gestión de la Calidad (SGC) — Sanatorio Argentino</td>
                            </tr>
                            <tr>
                                <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center' }}>ITAES-EST-04</td>
                                <td style={{ border: '1px solid #000', padding: '4px 8px' }}>Estándares de Acreditación de Establecimientos de Salud — ITAES</td>
                            </tr>
                            <tr>
                                <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center' }}>ITYS-05</td>
                                <td style={{ border: '1px solid #000', padding: '4px 8px' }}>Procedimiento Operativo de Seguridad, Acceso y Confidencialidad en Sistemas</td>
                            </tr>
                            <tr>
                                <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center' }}>ADM-QUI-02</td>
                                <td style={{ border: '1px solid #000', padding: '4px 8px' }}>Procedimiento de Admisión Quirúrgica y Circuito de Triage de Fojas</td>
                            </tr>
                        </tbody>
                    </table>

                    {/* Contenido Exhaustivo */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
                        <div>
                            <h3 style={{ fontSize: '13px', fontWeight: 800, margin: '0 0 6px 0' }}>1. OBJETIVO DEL MANUAL:</h3>
                            <p style={{ margin: 0, paddingLeft: '14px', textAlign: 'justify', color: '#1F2937' }}>
                                Establecer los procedimientos operativos estandarizados, responsabilidades funcionales y pautas de control para la totalidad de módulos que conforman el Sistema de Admisión Quirúrgica y Control Administrativo (ADM-QUI) del Sanatorio Argentino. Este manual sirve de guía de trabajo obligatoria para todo el personal asistencial y administrativo, garantizando la trazabilidad de historias clínicas, la precisión en facturación y el cumplimiento de las normativas de acreditación hospitalaria ITAES.
                            </p>
                        </div>

                        <div>
                            <h3 style={{ fontSize: '13px', fontWeight: 800, margin: '0 0 6px 0' }}>2. CAMPO DE APLICACIÓN Y ALCANCE:</h3>
                            <p style={{ margin: 0, paddingLeft: '14px', textAlign: 'justify', color: '#1F2937' }}>
                                Este manual es de aplicación directa y obligatoria para las áreas de: Innovación y Transformación Digital, Admisión Central y Quirúrgica, Recepción y Gestión de Turnos, Control de Altas Administrativas, Facturación Internado, Quirófanos Centrales, Laboratorios de Anatomía Patológica, Auditoría Médica y Recuperación de Cuentas del Sanatorio Argentino SRL.
                            </p>
                        </div>

                        <div>
                            <h3 style={{ fontSize: '13px', fontWeight: 800, margin: '0 0 6px 0' }}>3. DEFINICIONES Y GLOSARIO DE TÉRMINOS:</h3>
                            <ul style={{ margin: 0, paddingLeft: '32px', display: 'flex', flexDirection: 'column', gap: '4px', color: '#1F2937' }}>
                                <li><strong>ADM-QUI:</strong> Plataforma web integral para gestión de admisiones quirúrgicas, turnos, altas y facturación.</li>
                                <li><strong>SALUS:</strong> Sistema hospitalario central (SQL Server) fuente de datos demográficos y de internación.</li>
                                <li><strong>BETO IA:</strong> Asistente virtual con Inteligencia Artificial integrado exclusivamente a ADM-QUI para soporte y analítica.</li>
                                <li><strong>CONTROL DE ALTAS:</strong> Auditoría administrativa previa al traspaso de expedientes hospitalarios a Facturación.</li>
                                <li><strong>PARTICULAR (042):</strong> Paciente sin cobertura de obra social o con cliente registrado con su propio nombre.</li>
                                <li><strong>REMITO DE TRASPASO:</strong> Acta digital formal con código oficial (TRASP-YYYYMMDD-XXXX) y firmas de entrega y recepción.</li>
                                <li><strong>REMITO DE DEVOLUCIÓN:</strong> Constancia digital de rechazo de ficha desde Facturación hacia Control de Altas.</li>
                                <li><strong>TRIAGE DE FOJA:</strong> Análisis y detección inteligente de insumos protésicos y biopsias desde fojas quirúrgicas.</li>
                                <li><strong>META CLOUD API:</strong> Protocolo oficial de mensajería empresarial de WhatsApp sujeto a la ventana de 24 horas.</li>
                                <li><strong>LUP (Lección de Un Punto):</strong> Documento instructivo focalizado en un único procedimiento específico.</li>
                                <li><strong>ITAES:</strong> Instituto Técnico para la Acreditación de Establecimientos de Salud.</li>
                            </ul>
                        </div>

                        <div>
                            <h3 style={{ fontSize: '13px', fontWeight: 800, margin: '0 0 6px 0' }}>4. ARQUITECTURA GENERAL Y ACCESO:</h3>
                            <p style={{ margin: '0 0 6px 0', paddingLeft: '14px', color: '#1F2937' }}>
                                El sistema opera bajo arquitectura moderna cloud-edge conectada en tiempo real mediante Supabase (PostgreSQL) y el servicio local de sincronización con SALUS:
                            </p>
                            <ul style={{ margin: 0, paddingLeft: '32px', display: 'flex', flexDirection: 'column', gap: '4px', color: '#1F2937' }}>
                                <li><strong>Acceso de Usuarios:</strong> Inicio de sesión mediante usuario institucional o correo @sanatorioargentino.com.ar.</li>
                                <li><strong>Atajo Global:</strong> Combinación <code>Ctrl + K</code> para abrir la Paleta de Comandos y asistente Beto IA.</li>
                                <li><strong>Configuración Personalizada:</strong> Cada colaborador configura los módulos visibles según su función.</li>
                            </ul>
                        </div>

                        {/* Procedimientos Módulo por Módulo */}
                        <div>
                            <h3 style={{ fontSize: '13px', fontWeight: 800, margin: '0 0 10px 0' }}>5. GUÍA OPERATIVA PASO A PASO POR MÓDULO:</h3>
                            
                            <div style={{ paddingLeft: '14px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                
                                {/* 5.1 */}
                                <div style={{ borderLeft: '3px solid #1E5799', paddingLeft: '12px' }}>
                                    <strong style={{ color: '#1E5799', fontSize: '13px' }}>5.1 Cirugías y Triage Quirúrgico (SurgeriesPanel):</strong>
                                    <p style={{ margin: '3px 0 6px 0', color: '#374151' }}>
                                        Centraliza la programación quirúrgica diaria. Permite auditar el cumplimiento prequirúrgico mediante el pipeline de estados:
                                    </p>
                                    <ul style={{ margin: 0, paddingLeft: '20px', color: '#374151' }}>
                                        <li><strong>Lila:</strong> Sin mensaje inicial enviado (verificar número telefónico).</li>
                                        <li><strong>Amarillo:</strong> Mensaje prequirúrgico emitido (esperando órdenes y estudios).</li>
                                        <li><strong>Verde:</strong> Cobertura validada y quirófano reservado.</li>
                                        <li><strong>Azul:</strong> Paciente confirmó asistencia efectiva y ayuno reglamentario.</li>
                                        <li><strong>Rojo:</strong> Cirugía reprogramada o suspendida.</li>
                                    </ul>
                                    <p style={{ margin: '6px 0 0 0', color: '#374151' }}>
                                        <strong>Paso a Paso Triage de Fojas:</strong> 1) Abrir cirugía y presionar "Ver Foja". 2) Cargar archivo PDF o imagen escaneada. 3) El sistema extrae automáticamente insumos y biopsias tomadas. 4) Validar insumos y confirmar guardado.
                                    </p>
                                </div>

                                {/* 5.2 */}
                                <div style={{ borderLeft: '3px solid #10B981', paddingLeft: '12px' }}>
                                    <strong style={{ color: '#059669', fontSize: '13px' }}>5.2 Cola de Turnos, Tótem y Boxes (TurnoAdminPanel):</strong>
                                    <p style={{ margin: '3px 0', color: '#374151' }}>
                                        <strong>1) Tótem Kiosco:</strong> El paciente retira ticket según motivo (Admisión, Quirófano, Consultas, Guardias, Entrega de Estudios). <strong>2) Llamado:</strong> El recepcionista selecciona su Box (1-8) y presiona "Llamar Siguiente". <strong>3) Pantalla Central:</strong> Emite campana y voz sintetizada. <strong>4) Atención:</strong> Se marca "Atendiendo" y luego "Finalizado".
                                    </p>
                                </div>

                                {/* 5.3 */}
                                <div style={{ borderLeft: '3px solid #8B5CF6', paddingLeft: '12px' }}>
                                    <strong style={{ color: '#7C3AED', fontSize: '13px' }}>5.3 Control de Altas Administrativas (AltasPanel):</strong>
                                    <p style={{ margin: '3px 0', color: '#374151' }}>
                                        Paginación ágil de a 10 por defecto. Mapeo automático a <code>Particular</code> para <code>042 - PARTICULARES</code> o nombres de personas. Fusión de registros duplicados <code>[🔗 Fusionada]</code>. Control de internaciones prolongadas (Cruza Mes) y gestión de pagarés/garantías.
                                    </p>
                                    <p style={{ margin: '4px 0 0 0', color: '#374151' }}>
                                        <strong>Paso a Paso Traspaso a Facturación:</strong> 1) Seleccionar fichas en estado "Alta Adm". 2) Presionar "Generar Traspaso". 3) Completar nombres de quien entrega y quien recibe. 4) Capturar firmas digitales. 5) El sistema genera el código <code>TRASP-YYYYMMDD-XXXX</code>, descarga la constancia PDF y pasa las fichas a Facturación.
                                    </p>
                                </div>

                                {/* 5.4 */}
                                <div style={{ borderLeft: '3px solid #EF4444', paddingLeft: '12px' }}>
                                    <strong style={{ color: '#DC2626', fontSize: '13px' }}>5.4 Facturación Internado y Devoluciones (FacturacionPanel):</strong>
                                    <p style={{ margin: '3px 0', color: '#374151' }}>
                                        Distribución de expedientes a analistas (Jorge Terrera, Paola Illanes, Inés Dona, etc.). Detección automática de comprobantes emitidos en SALUS (PDV 21/31) con marcación a "Facturada". Circuito de rechazo mediante Carrito de Devolución a Altas con motivo justificado y constancia firmada.
                                    </p>
                                </div>

                                {/* 5.5 */}
                                <div style={{ borderLeft: '3px solid #3B82F6', paddingLeft: '12px' }}>
                                    <strong style={{ color: '#2563EB', fontSize: '13px' }}>5.5 Deudas, Presupuestos y Mensajería Multilínea:</strong>
                                    <p style={{ margin: '3px 0', color: '#374151' }}>
                                        Gestión de saldos deudores de pacientes, cotización formal de presupuestos quirúrgicos en PDF con validez legal y mensajería multilínea (Línea Estándar y Meta Cloud API con control estricto de la ventana de 24 horas y plantillas aprobadas).
                                    </p>
                                </div>

                                {/* 5.6 */}
                                <div style={{ borderLeft: '3px solid #F59E0B', paddingLeft: '12px' }}>
                                    <strong style={{ color: '#D97706', fontSize: '13px' }}>5.6 Asociaciones, Laboratorios de Anatomía Patológica y Activos QR:</strong>
                                    <p style={{ margin: '3px 0', color: '#374151' }}>
                                        Agrupación y actas de entrega de fojas para Asociaciones Médicas, trazabilidad de muestras de biopsia con reglas <code>Facturar</code> vs <code>Entregar</code> (CEDAP, Agüero, Ríos, Cuyo) e inventario de aparatología médica con etiquetas de código QR para auditoría física.
                                    </p>
                                </div>

                                {/* 5.7 */}
                                <div style={{ borderLeft: '3px solid #0284C7', paddingLeft: '12px' }}>
                                    <strong style={{ color: '#0284C7', fontSize: '13px' }}>5.7 Asistente Beto IA, Guardias Médicas y Auditoría HC:</strong>
                                    <p style={{ margin: '3px 0', color: '#374151' }}>
                                        Beto IA responde consultas de datos en lenguaje natural, emite reportes ejecutivos en PDF y exporta a Excel (<code>Ctrl + K</code>). Monitoreo de consultas de guardia (~5.800/mes) y control de calidad documental de historias clínicas conforme a normativas ITAES.
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Contingencias */}
                        <div>
                            <h3 style={{ fontSize: '13px', fontWeight: 800, margin: '0 0 6px 0' }}>6. PLAN DE CONTINGENCIA ANTE FALLAS DE SISTEMA:</h3>
                            <table style={{ width: '100%', borderCollapse: 'collapse', border: '1.5px solid #000', fontSize: '11px' }}>
                                <thead>
                                    <tr style={{ background: '#E5E7EB' }}>
                                        <th style={{ border: '1px solid #000', padding: '4px 8px', textAlign: 'left', width: '30%', fontWeight: 700 }}>Incidencia Técnica</th>
                                        <th style={{ border: '1px solid #000', padding: '4px 8px', textAlign: 'left', width: '50%', fontWeight: 700 }}>Procedimiento de Contingencia</th>
                                        <th style={{ border: '1px solid #000', padding: '4px 8px', textAlign: 'center', width: '20%', fontWeight: 700 }}>Responsable</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td style={{ border: '1px solid #000', padding: '4px 8px', fontWeight: 700 }}>Caída de sync-server SALUS</td>
                                        <td style={{ border: '1px solid #000', padding: '4px 8px' }}>Ejecutar script local "Actualizar SALUS.bat" y verificar log de conexión SQL</td>
                                        <td style={{ border: '1px solid #000', padding: '4px 8px', textAlign: 'center' }}>Operador / Innovación</td>
                                    </tr>
                                    <tr>
                                        <td style={{ border: '1px solid #000', padding: '4px 8px', fontWeight: 700 }}>Corte de conectividad a Internet</td>
                                        <td style={{ border: '1px solid #000', padding: '4px 8px' }}>Registrar admisiones en planillas de contingencia manual hasta restablecimiento</td>
                                        <td style={{ border: '1px solid #000', padding: '4px 8px', textAlign: 'center' }}>Personal de Admisión</td>
                                    </tr>
                                    <tr>
                                        <td style={{ border: '1px solid #000', padding: '4px 8px', fontWeight: 700 }}>Expiración ventana 24hs WhatsApp</td>
                                        <td style={{ border: '1px solid #000', padding: '4px 8px' }}>Utilizar exclusivamente plantillas oficiales HSM aprobadas en el módulo de Mensajería</td>
                                        <td style={{ border: '1px solid #000', padding: '4px 8px', textAlign: 'center' }}>Operador Mensajería</td>
                                    </tr>
                                    <tr>
                                        <td style={{ border: '1px solid #000', padding: '4px 8px', fontWeight: 700 }}>Falla de pantalla de turnos</td>
                                        <td style={{ border: '1px solid #000', padding: '4px 8px' }}>Realizar llamado a viva voz indicando número de turno y Box correspondiente</td>
                                        <td style={{ border: '1px solid #000', padding: '4px 8px', textAlign: 'center' }}>Recepción Central</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Pie de Firmas Oficial */}
                    <div style={{ marginTop: '30px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', border: '1.5px solid #000', fontSize: '11px' }}>
                            <tbody>
                                <tr style={{ height: '90px' }}>
                                    <td style={{ border: '1.5px solid #000', width: '33.33%', padding: '6px', verticalAlign: 'top', position: 'relative' }}>
                                        <div style={{ fontSize: '10px', fontWeight: 600 }}>ELABORADO:</div>
                                        <div style={{ position: 'absolute', bottom: '8px', left: 0, right: 0, textAlign: 'center' }}>
                                            <div style={{ fontWeight: 800, fontSize: '12px' }}>{DOC_META.elaboro}</div>
                                            <div style={{ fontSize: '9.5px', color: '#4B5563', marginTop: '2px', fontWeight: 500 }}>{DOC_META.elaboroCargo}</div>
                                        </div>
                                    </td>
                                    <td style={{ border: '1.5px solid #000', width: '33.33%', padding: '6px', verticalAlign: 'top', position: 'relative' }}>
                                        <div style={{ fontSize: '10px', fontWeight: 600 }}>REVISADO:</div>
                                        <div style={{ position: 'absolute', bottom: '8px', left: 0, right: 0, textAlign: 'center' }}>
                                            <div style={{ fontWeight: 800, fontSize: '12px' }}>{DOC_META.reviso}</div>
                                            <div style={{ fontSize: '9.5px', color: '#4B5563', marginTop: '2px', fontWeight: 500 }}>{DOC_META.revisoCargo}</div>
                                        </div>
                                    </td>
                                    <td style={{ border: '1.5px solid #000', width: '33.33%', padding: '6px', verticalAlign: 'top', position: 'relative' }}>
                                        <div style={{ fontSize: '10px', fontWeight: 600 }}>APROBADO:</div>
                                        <div style={{ position: 'absolute', bottom: '8px', left: 0, right: 0, textAlign: 'center' }}>
                                            <div style={{ fontWeight: 800, fontSize: '12px' }}>{DOC_META.aprobo}</div>
                                            <div style={{ fontSize: '9.5px', color: '#4B5563', marginTop: '2px', fontWeight: 500 }}>{DOC_META.aproboCargo}</div>
                                        </div>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* TAB 2: Diagramas de Flujo Interactivos */}
            {activeTab === 'diagramas' && (
                <div style={{
                    width: '100%',
                    maxWidth: '960px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '20px'
                }}>
                    {/* Diagrama 1: Flujo General */}
                    <div style={{ background: '#FFF', borderRadius: '14px', padding: '24px', border: '1px solid #E2E8F0', boxShadow: '0 4px 15px rgba(0,0,0,0.05)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                            <Layers color="#1E5799" size={20} />
                            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>1. Diagrama General del Flujo Hospitalario en ADM-QUI</h3>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', alignItems: 'center' }}>
                            <div style={{ background: '#EFF6FF', border: '1.5px solid #93C5FD', borderRadius: '10px', padding: '14px', textAlign: 'center' }}>
                                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#1E40AF', textTransform: 'uppercase' }}>Paso 1</div>
                                <div style={{ fontWeight: 800, color: '#1E3A8A', marginTop: '4px' }}>SALUS Sync</div>
                                <div style={{ fontSize: '0.75rem', color: '#475569', marginTop: '4px' }}>Sincronización en tiempo real SQL Server</div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'center' }}><ArrowRight color="#94A3B8" /></div>
                            <div style={{ background: '#ECFDF5', border: '1.5px solid #6EE7B7', borderRadius: '10px', padding: '14px', textAlign: 'center' }}>
                                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#065F46', textTransform: 'uppercase' }}>Paso 2</div>
                                <div style={{ fontWeight: 800, color: '#064E3B', marginTop: '4px' }}>Turnos & Admisión</div>
                                <div style={{ fontSize: '0.75rem', color: '#475569', marginTop: '4px' }}>Tótem táctil y Boxes 1-8</div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'center' }}><ArrowRight color="#94A3B8" /></div>
                            <div style={{ background: '#F5F3FF', border: '1.5px solid #C4B5FD', borderRadius: '10px', padding: '14px', textAlign: 'center' }}>
                                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#5B21B6', textTransform: 'uppercase' }}>Paso 3</div>
                                <div style={{ fontWeight: 800, color: '#4C1D95', marginTop: '4px' }}>Control de Altas</div>
                                <div style={{ fontSize: '0.75rem', color: '#475569', marginTop: '4px' }}>Auditoría 042 y Remito TRASP</div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'center' }}><ArrowRight color="#94A3B8" /></div>
                            <div style={{ background: '#FEF2F2', border: '1.5px solid #FCA5A5', borderRadius: '10px', padding: '14px', textAlign: 'center' }}>
                                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#991B1B', textTransform: 'uppercase' }}>Paso 4</div>
                                <div style={{ fontWeight: 800, color: '#7F1D1D', marginTop: '4px' }}>Facturación SALUS</div>
                                <div style={{ fontSize: '0.75rem', color: '#475569', marginTop: '4px' }}>Detección PDV 21/31 / Devolución</div>
                            </div>
                        </div>
                    </div>

                    {/* Diagrama 2: Pipeline de Cirugías */}
                    <div style={{ background: '#FFF', borderRadius: '14px', padding: '24px', border: '1px solid #E2E8F0', boxShadow: '0 4px 15px rgba(0,0,0,0.05)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                            <Stethoscope color="#1E5799" size={20} />
                            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>2. Pipeline Quirúrgico por Estados WhatsApp</h3>
                        </div>
                        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                            <div style={{ flex: '1 1 160px', background: '#F3E8FF', border: '1.5px solid #D8B4FE', borderRadius: '10px', padding: '12px' }}>
                                <div style={{ fontWeight: 800, color: '#6B21A8' }}>🟣 Lila: Sin Mensaje</div>
                                <p style={{ margin: '4px 0 0 0', fontSize: '0.78rem', color: '#581C87' }}>Importado de SALUS. Revisar número de celular.</p>
                            </div>
                            <div style={{ flex: '1 1 160px', background: '#FEF3C7', border: '1.5px solid #FCD34D', borderRadius: '10px', padding: '12px' }}>
                                <div style={{ fontWeight: 800, color: '#92400E' }}>🟡 Amarillo: En Revisión</div>
                                <p style={{ margin: '4px 0 0 0', fontSize: '0.78rem', color: '#78350F' }}>Mensaje prequirúrgico emitido. Esperando órdenes.</p>
                            </div>
                            <div style={{ flex: '1 1 160px', background: '#DCFCE7', border: '1.5px solid #86EFAC', borderRadius: '10px', padding: '12px' }}>
                                <div style={{ fontWeight: 800, color: '#166534' }}>🟢 Verde: Autorizada</div>
                                <p style={{ margin: '4px 0 0 0', fontSize: '0.78rem', color: '#14532D' }}>Cobertura validada y quirófano reservado.</p>
                            </div>
                            <div style={{ flex: '1 1 160px', background: '#DBEAFE', border: '1.5px solid #93C5FD', borderRadius: '10px', padding: '12px' }}>
                                <div style={{ fontWeight: 800, color: '#1E40AF' }}>🔵 Azul: Confirmada</div>
                                <p style={{ margin: '4px 0 0 0', fontSize: '0.78rem', color: '#1E3A8A' }}>Paciente ratificó asistencia y ayuno preoperatorio.</p>
                            </div>
                            <div style={{ flex: '1 1 160px', background: '#FEE2E2', border: '1.5px solid #FCA5A5', borderRadius: '10px', padding: '12px' }}>
                                <div style={{ fontWeight: 800, color: '#991B1B' }}>🔴 Rojo: Alerta</div>
                                <p style={{ margin: '4px 0 0 0', fontSize: '0.78rem', color: '#7F1D1D' }}>Cirugía suspendida o reprogramada.</p>
                            </div>
                        </div>
                    </div>

                    {/* Diagrama 3: Circuito de Traspaso y Devolución */}
                    <div style={{ background: '#FFF', borderRadius: '14px', padding: '24px', border: '1px solid #E2E8F0', boxShadow: '0 4px 15px rgba(0,0,0,0.05)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                            <FileCheck2 color="#1E5799" size={20} />
                            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>3. Circuito Cerrado de Traspaso y Devolución de Historias Clínicas</h3>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '16px', alignItems: 'center' }}>
                            <div style={{ background: '#F8FAFC', border: '2px dashed #94A3B8', borderRadius: '12px', padding: '16px' }}>
                                <h4 style={{ margin: '0 0 8px 0', color: '#1E293B', fontWeight: 800 }}>Control de Altas Administrativas</h4>
                                <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.82rem', color: '#475569' }}>
                                    <li>Auditoría médica y administrativa</li>
                                    <li>Mapeo automático a Particular (042)</li>
                                    <li>Generación de Remito TRASP con 2 firmas</li>
                                </ul>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#16A34A', background: '#DCFCE7', padding: '2px 8px', borderRadius: '6px' }}>TRASP (Pase) ➔</span>
                                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#DC2626', background: '#FEE2E2', padding: '2px 8px', borderRadius: '6px' }}>⬅ DEV (Rechazo)</span>
                            </div>
                            <div style={{ background: '#F8FAFC', border: '2px dashed #94A3B8', borderRadius: '12px', padding: '16px' }}>
                                <h4 style={{ margin: '0 0 8px 0', color: '#1E293B', fontWeight: 800 }}>Facturación Internado</h4>
                                <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.82rem', color: '#475569' }}>
                                    <li>Asignación a analistas liquidadores</li>
                                    <li>Detección de facturas SALUS PDV 21/31</li>
                                    <li>Carrito de Devolución con motivo formal</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB 3: Guía Didáctica Módulo por Módulo */}
            {activeTab === 'guia' && (
                <div style={{
                    width: '100%',
                    maxWidth: '960px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '16px'
                }}>
                    <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '12px', padding: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <Sparkles color="#1E5799" size={24} />
                        <div>
                            <h4 style={{ margin: 0, fontWeight: 800, color: '#1E3A8A' }}>Guía de Capacitación Rápida</h4>
                            <p style={{ margin: 0, fontSize: '0.82rem', color: '#1E40AF' }}>
                                Consulta cómo utilizar cada módulo con instrucciones claras, controles y acciones disponibles.
                            </p>
                        </div>
                    </div>

                    {/* Módulo 1 */}
                    <div style={{ background: '#FFF', borderRadius: '12px', padding: '20px', border: '1px solid #E2E8F0' }}>
                        <h4 style={{ margin: '0 0 8px 0', color: '#1E5799', fontWeight: 800, fontSize: '1rem' }}>Módulo 1: Cirugías y Triage Quirúrgico</h4>
                        <ol style={{ margin: 0, paddingLeft: '20px', fontSize: '0.85rem', color: '#334155', lineHeight: 1.6 }}>
                            <li>Revisar el listado de cirugías sincronizadas de SALUS en la pestaña superior.</li>
                            <li>Hacer clic en el botón de WhatsApp para enviar el mensaje prequirúrgico automático.</li>
                            <li>Hacer clic en "Ver Foja" para cargar el archivo digital y extraer automáticamente los insumos y biopsias con IA.</li>
                            <li>Actualizar el estado del pipeline según la respuesta del paciente (Verde si autoriza, Azul si confirma).</li>
                        </ol>
                    </div>

                    {/* Módulo 2 */}
                    <div style={{ background: '#FFF', borderRadius: '12px', padding: '20px', border: '1px solid #E2E8F0' }}>
                        <h4 style={{ margin: '0 0 8px 0', color: '#059669', fontWeight: 800, fontSize: '1rem' }}>Módulo 2: Cola de Turnos y Boxes</h4>
                        <ol style={{ margin: 0, paddingLeft: '20px', fontSize: '0.85rem', color: '#334155', lineHeight: 1.6 }}>
                            <li>El paciente selecciona en el tótem su trámite y obtiene ticket numérico.</li>
                            <li>El recepcionista entra a su panel, selecciona su Box (1 a 8) y presiona "Llamar Siguiente".</li>
                            <li>El llamador central emite el aviso acústico y locución institucional.</li>
                            <li>Finalizada la atención, se marca "Finalizado" para registrar el tiempo de atención.</li>
                        </ol>
                    </div>

                    {/* Módulo 3 */}
                    <div style={{ background: '#FFF', borderRadius: '12px', padding: '20px', border: '1px solid #E2E8F0' }}>
                        <h4 style={{ margin: '0 0 8px 0', color: '#7C3AED', fontWeight: 800, fontSize: '1rem' }}>Módulo 3: Control de Altas y Traspaso</h4>
                        <ol style={{ margin: 0, paddingLeft: '20px', fontSize: '0.85rem', color: '#334155', lineHeight: 1.6 }}>
                            <li>Auditar las internaciones del mes. El sistema pagina de a 10 por defecto para mayor rapidez.</li>
                            <li>Verificar que clientes 042 o con nombre de paciente figuren automáticamente como "Particular".</li>
                            <li>Seleccionar las fichas listas (estado "Alta Adm") y hacer clic en "Generar Traspaso".</li>
                            <li>Capturar las firmas de entrega y recepción en pantalla para emitir el remito oficial TRASP en PDF.</li>
                        </ol>
                    </div>

                    {/* Módulo 4 */}
                    <div style={{ background: '#FFF', borderRadius: '12px', padding: '20px', border: '1px solid #E2E8F0' }}>
                        <h4 style={{ margin: '0 0 8px 0', color: '#DC2626', fontWeight: 800, fontSize: '1rem' }}>Módulo 4: Facturación Internado y Devoluciones</h4>
                        <ol style={{ margin: 0, paddingLeft: '20px', fontSize: '0.85rem', color: '#334155', lineHeight: 1.6 }}>
                            <li>Asignar las fichas recibidas a los analistas liquidadores.</li>
                            <li>El sistema detecta automáticamente las facturas emitidas en SALUS (PDV 21/31) y las marca como "Facturada".</li>
                            <li>Si un expediente está incompleto, agregarlo al "Carrito de Devolución" con el motivo específico.</li>
                            <li>Generar el Remito de Devolución firmado para devolver el expediente a Control de Altas.</li>
                        </ol>
                    </div>

                    {/* Módulo 5 */}
                    <div style={{ background: '#FFF', borderRadius: '12px', padding: '20px', border: '1px solid #E2E8F0' }}>
                        <h4 style={{ margin: '0 0 8px 0', color: '#1E5799', fontWeight: 800, fontSize: '1rem' }}>Módulo 5: Asistente Beto IA</h4>
                        <ol style={{ margin: 0, paddingLeft: '20px', fontSize: '0.85rem', color: '#334155', lineHeight: 1.6 }}>
                            <li>Presionar <code>Ctrl + K</code> en cualquier pantalla para abrir Beto IA.</li>
                            <li>Escribir preguntas en lenguaje natural (ej. "¿Cuántas cirugías hay programadas para mañana?").</li>
                            <li>Descargar reportes ejecutivos en PDF o exportar tablas masivas a Excel con un solo clic.</li>
                        </ol>
                    </div>
                </div>
            )}

            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,400;1,600;1,700&display=swap');
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                @media print {
                    body { background: white !important; padding: 0 !important; font-family: 'Montserrat', sans-serif !important; }
                    button, .no-print { display: none !important; }
                }
            `}</style>
        </div>
    );
}
