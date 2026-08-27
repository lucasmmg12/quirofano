/**
 * ManualProcedimientos.jsx
 * Manual de Procedimientos Operativos Integrales — Sistema ADM-QUI
 * Estructura Oficial del Sistema de Gestión de la Calidad (SGC) / Normas ITAES
 * Sanatorio Argentino SRL
 * 
 * Elaborado por: Lucas Marinero (Responsable de Innovación y Transformación Digital)
 * Revisado por: Gabriela Iragorre (Responsable Documentos SGC)
 * Aprobado por: Dr. Carlos Buteler (Director Médico)
 */

import React, { useState } from 'react';
import { BookOpen, Download, Printer, Loader2, CheckCircle2, FileText, ChevronRight, Search, ShieldCheck, Sparkles, User, Calendar, Award } from 'lucide-react';
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
};

function drawWatermark(doc) {
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    doc.saveGraphicsState();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(34);
    doc.setTextColor(240, 243, 248);
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

    // Col 2: INSTRUCTIVO + Título
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

    // Fila Inferior: Aviso de copia controlada
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
    doc.text('[PAUTA DE CONTROL / AUDITORÍA]', ML + 4, y + 4.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    doc.text(lines, ML + 4, y + 8.5);
    return y + boxH + 3;
}

/**
 * Generador exhaustivo del Manual Oficial de Procedimientos en PDF
 */
export async function generateManualPDF() {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const counters = { page: 1 };
    
    // Página 1: Encabezado + Tablas de Control SGC + Secciones 1 a 4
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
            ['00', 'Versión original del sistema de administración quirúrgica y triage', 'Lucas Marinero', '20/03/2024'],
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

    // 5. PROCEDIMIENTOS DETALLADOS
    y = checkPageBreak(doc, counters, y, 20);
    y = sectionTitle(doc, '5. PROCEDIMIENTOS OPERATIVOS POR MÓDULO:', y);

    // 5.1 CIRUGÍAS Y TRIAGE
    y = checkPageBreak(doc, counters, y, 35);
    y = subTitle(doc, '5.1 MÓDULO DE CIRUGÍAS Y TRIAGE QUIRÚRGICO (SurgeriesPanel)', y);
    y = para(doc, 'Centraliza la programación quirúrgica diaria importada desde SALUS. Permite auditar el cumplimiento prequirúrgico y la correcta documentación médica.', y);
    y = para(doc, 'A) Pipeline de Estados por WhatsApp:', y);
    y = bulletList(doc, [
        'Lila (Sin Mensaje): Paciente recién programado. Requiere verificar teléfono y datos de contacto.',
        'Amarillo (En Revisión): Mensaje de preparación enviado. Esperando recepción de órdenes y estudios.',
        'Verde (Autorizada): Documentación aprobada por Admisión y quirófano confirmado.',
        'Azul (Confirmada): Paciente ratificó su asistencia y cumplimiento de ayuno preoperatorio.',
        'Rojo / Alerta: Cirugía suspendida o reprogramada por indicación médica o administrativa.'
    ], y);
    y = para(doc, 'B) Procedimiento de Triage de Fojas Quirúrgicas:', y);
    y = stepList(doc, [
        'Localizar al paciente en el panel y presionar "Ver Foja / Cargar Foja".',
        'Subir la imagen o archivo PDF del parte quirúrgico firmado por el cirujano y anestesiólogo.',
        'El motor de IA extrae automáticamente los insumos implantados (mallas, tornillos, suturas) y piezas de biopsia.',
        'Validar los insumos detectados con la foja física y confirmar el guardado.'
    ], y);
    y = noteBox(doc, 'Toda foja que contenga toma de biopsia debe ser remitida inmediatamente al Módulo de Laboratorios para asignarle regla Facturar o Entregar.', y);

    // 5.2 COLA DE TURNOS
    y = checkPageBreak(doc, counters, y, 35);
    y = subTitle(doc, '5.2 MÓDULO DE COLA DE TURNOS Y BOXES DE RECEPCIÓN (TurnoAdminPanel)', y);
    y = para(doc, 'Administra la atención presencial de pacientes en la sede central mediante tótem interactivo y llamador acústico.', y);
    y = stepList(doc, [
        'Emisión de Ticket en Tótem: El paciente pulsa en pantalla su tipo de trámite (Admisión, Quirófano, Consultas, Guardias, Entrega de Estudios) y obtiene ticket con letra y número correlativo.',
        'Llamado desde Box: El personal de recepción ingresa al panel, selecciona su Box asignado (1 al 8) y hace clic en "Llamar Siguiente".',
        'Anuncio en Pantalla Central: El sistema emite campana sonora y locución automática indicando turno y Box.',
        'Atención y Cierre: Se marca el turno como "Atendiendo", luego "Finalizado". Si el paciente no se presenta tras 3 llamados, se marca "Ausente".'
    ], y);

    // 5.3 CONTROL DE ALTAS ADMINISTRATIVAS
    y = checkPageBreak(doc, counters, y, 40);
    y = subTitle(doc, '5.3 MÓDULO DE CONTROL DE ALTAS ADMINISTRATIVAS (AltasPanel)', y);
    y = para(doc, 'Auditoría obligatoria previa al traspaso de historias clínicas internadas a Facturación.', y);
    y = bulletList(doc, [
        'Paginación Ágil: Visualización predeterminada de a 10 registros por página para máxima velocidad de auditoría.',
        'Mapeo Automático de Particulares: Si el cliente es "042 - PARTICULARES" o coincide con el nombre del paciente, el sistema asigna automáticamente el estado "Particular".',
        'Fusión de Admisiones Duplicadas: Admisiones con la misma fecha de ingreso y paciente se agrupan en una única fila indicando el badge [🔗 Fusionada].',
        'Control de Cruza Mes: Pacientes con internación prolongada que traspasan el mes calendario se auditan con alertas de cierre parcial.',
        'Garantías y Pagarés: Registro de pagarés y comprobantes de depósito para pacientes sin cobertura integral.'
    ], y);
    y = para(doc, 'Circuito del Carrito de Traspaso a Facturación:', y);
    y = stepList(doc, [
        'Filtrar por mes y seleccionar las fichas en estado "Alta Adm".',
        'Presionar "Generar Traspaso" para desplegar el modal con el resumen nominal de pacientes.',
        'Ingresar los nombres de quien entrega (Admisión) y quien recibe (Facturación).',
        'Capturar ambas firmas digitales sobre la pantalla táctil.',
        'El sistema genera el código oficial TRASP-YYYYMMDD-XXXX, emite el PDF firmado y transfiere las fichas a la bandeja de Facturación.'
    ], y);

    // 5.4 FACTURACIÓN INTERNADO
    y = checkPageBreak(doc, counters, y, 35);
    y = subTitle(doc, '5.4 MÓDULO DE FACTURACIÓN INTERNADO Y DEVOLUCIONES (FacturacionPanel)', y);
    y = para(doc, 'Espacio de liquidación hospitalaria para auditar y facturar los expedientes transferidos desde Altas.', y);
    y = bulletList(doc, [
        'Asignación de Analistas: Distribución nominal de fichas a liquidadores (Jorge Terrera, Paola Illanes, Inés Dona, etc.).',
        'Detección Automática de SALUS: Monitoreo de facturas emitidas en puntos de venta 21 y 31. Al facturar en SALUS, el sistema actualiza automáticamente a "Facturada" con número de comprobante.',
        'Circuito de Devolución a Altas: Si una historia clínica presenta faltantes (sin firma médica, orden no autorizada), se añade al Carrito de Devolución indicando motivo específico y se genera Remito de Devolución firmado.',
        'Historial de Devoluciones: Pestaña con bitácora inmutable de todas las devoluciones emitidas con fecha, hora y motivo.'
    ], y);

    // 5.5 DEUDAS DE PACIENTES
    y = checkPageBreak(doc, counters, y, 30);
    y = subTitle(doc, '5.5 MÓDULO DE RECUPERACIÓN Y GESTIÓN DE DEUDAS (DeudasPanel)', y);
    y = para(doc, 'Monitoreo de saldos pendientes por coseguros, prótesis no reconocidas o diferencias de internación particular.', y);
    y = stepList(doc, [
        'Registro de Saldo: Carga del importe adeudado con detalle de la prestación médica y comprobante.',
        'Convenios y Planes de Pago: Acuerdos de pago en cuotas, transferencias bancarias o cheques.',
        'Seguimiento y WhatsApp: Envío de recordatorios formales de regularización de cuenta a través del canal oficial.'
    ], y);

    // 5.6 PRESUPUESTOS
    y = checkPageBreak(doc, counters, y, 30);
    y = subTitle(doc, '5.6 MÓDULO DE PRESUPUESTOS QUIRÚRGICOS (PresupuestosPanel)', y);
    y = para(doc, 'Cotización y emisión formal de presupuestos médicos sanatoriales para pacientes particulares y coberturas especiales.', y);
    y = stepList(doc, [
        'Cargar datos del paciente, cirujano responsable y procedimiento quirúrgico solicitado.',
        'Desglosar conceptos: Derechos de quirófano, honorarios médicos y anestésicos, días de cama (piso/UTI) y descartables.',
        'Emitir presupuesto oficial en PDF con logotipo institucional, validez legal (15 a 30 días) y firma.',
        'Enviar el documento PDF directamente por WhatsApp al paciente desde el sistema.'
    ], y);

    // 5.7 MENSAJERÍA WHATSAPP MULTILÍNEA
    y = checkPageBreak(doc, counters, y, 30);
    y = subTitle(doc, '5.7 MÓDULO DE MENSAJERÍA WHATSAPP MULTILÍNEA (MessagingPanel)', y);
    y = para(doc, 'Centro unificado de comunicaciones con pacientes a través de líneas autorizadas de Sanatorio Argentino.', y);
    y = bulletList(doc, [
        'Línea Estándar (BuilderBot): Para mensajería ágil y resolución de consultas operativas.',
        'Línea Meta Cloud API (Oficial): Cumplimiento estricto de la política de 24 horas. Pasado dicho plazo, el sistema exige utilizar plantillas HSM aprobadas.',
        'Template Manager: Plantillas institucionales con variables automáticas ({{nombre}}, {{fecha_cirugia}}, {{medico}}).'
    ], y);

    // 5.8 ASOCIACIONES MÉDICAS
    y = checkPageBreak(doc, counters, y, 25);
    y = subTitle(doc, '5.8 MÓDULO DE ASOCIACIONES MÉDICAS (AsociacionesEntregaPanel)', y);
    y = para(doc, 'Agrupación de fojas y órdenes quirúrgicas según la entidad médica gremial del profesional actuante (Asociación Médica de San Juan, Colegio Médico, etc.). Permite emitir constancias de entrega formal en PDF con detalle nominal y firmas.', y);

    // 5.9 LABORATORIOS
    y = checkPageBreak(doc, counters, y, 30);
    y = subTitle(doc, '5.9 MÓDULO DE LABORATORIOS DE ANATOMÍA PATOLÓGICA (LaboratoriosPanel)', y);
    y = para(doc, 'Control y trazabilidad de muestras de biopsia obtenidas en quirófano y derivadas a laboratorios externos (CEDAP, Agüero, Ríos, Cuyo).', y);
    y = bulletList(doc, [
        'Regla "Facturar": La muestra se liquida institucionalmente a través del Sanatorio.',
        'Regla "Entregar": La muestra es retirada físicamente por el paciente o familiar directo con firma y DNI.',
        'Portal de Laboratorios: Acceso seguro para que cada centro confirme recepción de muestras en tiempo real.'
    ], y);

    // 5.10 ACTIVOS MÉDICOS
    y = checkPageBreak(doc, counters, y, 25);
    y = subTitle(doc, '5.10 MÓDULO DE ACTIVOS MÉDICOS Y ETIQUETAS QR (ActivosPanel)', y);
    y = para(doc, 'Inventario técnico de equipamiento médico y electromedicina de quirófanos y salas (torres de laparoscopía, electrobisturíes, mesas de cirugía, respiradores). Permite imprimir etiquetas QR para auditoría física inmediata y registrar historial de mantenimientos preventivos.', y);

    // 5.11 BETO IA
    y = checkPageBreak(doc, counters, y, 30);
    y = subTitle(doc, '5.11 ASISTENTE INTELIGENTE BETO IA (BetoWidget / BetoAnalyticsPanel)', y);
    y = para(doc, 'Beto es el asistente de Inteligencia Artificial exclusivo del sistema ADM-QUI, diseñado para brindar respuestas inmediatas sobre datos y agilizar la gestión.', y);
    y = bulletList(doc, [
        'Consultas en Lenguaje Natural: Preguntas sobre cirugías del día, estado de internaciones, altas pendientes o productividad.',
        'Generación de Reportes Ejecutivos: Emisión instantánea de resúmenes en PDF estructurados y descargables.',
        'Exportación Masiva a Excel: Creación de archivos .xlsx procesados para análisis de gestión.',
        'Atajo Global [Ctrl + K]: Acceso universal desde cualquier pantalla del sistema.',
        'Beto Analytics: Tablero de telemetría que audita el volumen de consultas y desempeño del modelo.'
    ], y);

    // 5.12 CONSULTAS DE GUARDIA
    y = checkPageBreak(doc, counters, y, 25);
    y = subTitle(doc, '5.12 MÓDULO DE CONSULTAS DE GUARDIA AMBULATORIA (GuardiaPanel)', y);
    y = para(doc, 'Monitoreo continuo de la atención médica en el Servicio de Urgencias (~5.800 consultas/mes). Control de tiempos de espera, clasificación de gravedad por código de color (Rojo, Amarillo, Verde) y trazabilidad de pases a internación.', y);

    // 5.13 AUDITORÍA DE HISTORIAS CLÍNICAS
    y = checkPageBreak(doc, counters, y, 25);
    y = subTitle(doc, '5.13 MÓDULO DE AUDITORÍA DE HISTORIAS CLÍNICAS (AuditoriaHistoriasPanel)', y);
    y = para(doc, 'Control de calidad del registro clínico conforme a normativas ITAES. Verificación de consentimiento informado firmado, foja quirúrgica completa, protocolo anestésico, epicrisis y hojas de enfermería.', y);

    // 5.14 GOBERNANZA
    y = checkPageBreak(doc, counters, y, 25);
    y = subTitle(doc, '5.14 GOBERNANZA, ROLES Y AUDITORÍA DE ACTIVIDAD (GobernanzaPanel)', y);
    y = para(doc, 'Control de seguridad y permisos de acceso según matriz de roles (Admisión, Facturación, Laboratorios, Quirófano, Administrador). Registro inmutable de auditoría (Activity Log) que guarda cada login, modificación de estado, traspaso o devolución.', y);

    // 6. PLAN DE CONTINGENCIA
    y = checkPageBreak(doc, counters, y, 40);
    y = sectionTitle(doc, '6. PLAN DE CONTINGENCIA ANTE FALLAS DE SISTEMA:', y);
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

// ─── Componente React Principal ─────────────────────────────────────────────
export default function ManualProcedimientos() {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedSection, setSelectedSection] = useState('all');
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

    const modulesList = [
        { id: 'all', title: 'Manual Completo' },
        { id: '1', title: '1. Objetivo & Campo de Aplicación' },
        { id: '2', title: '2. Definiciones & Glosario' },
        { id: '3', title: '3. Arquitectura y Acceso' },
        { id: '4', title: '4. Cirugías y Triage Quirúrgico' },
        { id: '5', title: '5. Cola de Turnos y Boxes' },
        { id: '6', title: '6. Control de Altas Administrativas' },
        { id: '7', title: '7. Facturación Internado y Devoluciones' },
        { id: '8', title: '8. Deudas y Presupuestos' },
        { id: '9', title: '9. Mensajería WhatsApp Multilínea' },
        { id: '10', title: '10. Asociaciones y Laboratorios' },
        { id: '11', title: '11. Activos Médicos y Beto IA' },
        { id: '12', title: '12. Guardias y Auditoría HC' },
        { id: '13', title: '13. Gobernanza y Contingencias' },
    ];

    return (
        <div style={{
            minHeight: '100vh',
            background: '#F1F5F9',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            fontFamily: 'Inter, system-ui, -apple-system, sans-serif'
        }}>
            {/* Barra Superior */}
            <div style={{
                width: '100%',
                maxWidth: '960px',
                background: '#FFFFFF',
                borderRadius: '16px',
                padding: '16px 24px',
                boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
                border: '1px solid #E2E8F0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '20px',
                flexWrap: 'wrap',
                gap: '12px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                        width: '44px',
                        height: '44px',
                        borderRadius: '12px',
                        background: 'linear-gradient(135deg, #1E5799 0%, #2980B9 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#fff'
                    }}>
                        <BookOpen size={22} />
                    </div>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#0F172A' }}>
                            Manual de Procedimientos Operativos SGC
                        </h2>
                        <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748B' }}>
                            Código: <strong>{DOC_META.codigo}</strong> • Revisión Nº {DOC_META.revision} • Estándar ITAES
                        </p>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
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
                                Descargar Manual PDF Oficial
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Documento Interactivo SGC con todas las secciones */}
            <div style={{
                width: '100%',
                maxWidth: '960px',
                background: '#FFFFFF',
                borderRadius: '4px',
                boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
                border: '1px solid #D1D5DB',
                padding: '36px',
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                color: '#000000',
                fontSize: '13px',
                lineHeight: 1.55
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

                <div>
                    {/* Encabezado Oficial */}
                    <table style={{ width: '100%', borderCollapse: 'collapse', border: '1.5px solid #000', marginBottom: '16px' }}>
                        <tbody>
                            <tr>
                                <td style={{ border: '1.5px solid #000', width: '25%', padding: '8px', textAlign: 'center', verticalAlign: 'middle' }}>
                                    <div style={{ fontSize: '11px', fontWeight: 'bold', lineHeight: '1.2' }}>
                                        SANATORIO<br />ARGENTINO SRL
                                    </div>
                                    <hr style={{ border: 'none', borderTop: '1px solid #000', margin: '6px 0' }} />
                                    <div style={{ fontSize: '9px', fontWeight: 'bold', lineHeight: '1.2' }}>
                                        {DOC_META.departamento}
                                    </div>
                                </td>
                                <td style={{ border: '1.5px solid #000', width: '50%', padding: '8px', textAlign: 'center', verticalAlign: 'middle' }}>
                                    <div style={{ fontSize: '11px', fontWeight: 'normal', letterSpacing: '0.05em' }}>MANUAL DE PROCEDIMIENTOS OPERATIVOS:</div>
                                    <div style={{ fontSize: '13px', fontWeight: 'bold', marginTop: '4px' }}>
                                        {DOC_META.titulo}
                                    </div>
                                </td>
                                <td style={{ border: '1.5px solid #000', width: '25%', padding: '8px', textAlign: 'center', verticalAlign: 'middle' }}>
                                    <div style={{ fontSize: '18px', fontWeight: 'bold', letterSpacing: '0.05em' }}>{DOC_META.codigo}</div>
                                    <div style={{ fontSize: '11px', marginTop: '2px' }}>Revisión Nº {DOC_META.revision}</div>
                                    <div style={{ fontSize: '10px', marginTop: '2px', color: '#4B5563' }}>Documento Institucional SGC</div>
                                </td>
                            </tr>
                            <tr>
                                <td colSpan={3} style={{ border: '1.5px solid #000', background: '#E5E7EB', padding: '4px', textAlign: 'center', fontSize: '10px', fontWeight: 'bold' }}>
                                    VALIDO SOLO EN FORMATO ELECTRÓNICO – LAS COPIAS EN PAPEL CARECEN DE VALOR
                                </td>
                            </tr>
                        </tbody>
                    </table>

                    {/* Revisiones */}
                    <table style={{ width: '100%', borderCollapse: 'collapse', border: '1.5px solid #000', marginBottom: '14px', fontSize: '11px' }}>
                        <thead>
                            <tr>
                                <th colSpan={4} style={{ border: '1px solid #000', background: '#E5E7EB', padding: '4px 8px', textAlign: 'left', fontWeight: 'bold' }}>
                                    CONTROL DE REVISIONES Y ACTUALIZACIONES SGC
                                </th>
                            </tr>
                            <tr style={{ background: '#F3F4F6' }}>
                                <th style={{ border: '1px solid #000', padding: '4px', width: '40px', textAlign: 'center' }}>Nº</th>
                                <th style={{ border: '1px solid #000', padding: '4px', textAlign: 'left' }}>Descripción de los cambios</th>
                                <th style={{ border: '1px solid #000', padding: '4px', width: '180px', textAlign: 'center' }}>Autor</th>
                                <th style={{ border: '1px solid #000', padding: '4px', width: '110px', textAlign: 'center' }}>Fecha vigencia</th>
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

                    {/* Documentos de Referencia */}
                    <table style={{ width: '100%', borderCollapse: 'collapse', border: '1.5px solid #000', marginBottom: '20px', fontSize: '11px' }}>
                        <thead>
                            <tr>
                                <th colSpan={2} style={{ border: '1px solid #000', background: '#E5E7EB', padding: '4px 8px', textAlign: 'left', fontWeight: 'bold' }}>
                                    DOCUMENTOS DE REFERENCIA INSTITUCIONAL
                                </th>
                            </tr>
                            <tr style={{ background: '#F3F4F6' }}>
                                <th style={{ border: '1px solid #000', padding: '4px', width: '140px', textAlign: 'center' }}>Código</th>
                                <th style={{ border: '1px solid #000', padding: '4px', textAlign: 'left' }}>Título del documento</th>
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

                    {/* Contenido Exhaustivo de Secciones */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <div>
                            <h3 style={{ fontSize: '13px', fontWeight: 'bold', margin: '0 0 6px 0' }}>1. OBJETIVO DEL MANUAL:</h3>
                            <p style={{ margin: 0, paddingLeft: '14px', textAlign: 'justify', color: '#1F2937' }}>
                                Establecer los procedimientos operativos estandarizados, responsabilidades funcionales y pautas de control para la totalidad de módulos que conforman el Sistema de Admisión Quirúrgica y Control Administrativo (ADM-QUI) del Sanatorio Argentino. Este manual sirve de guía de trabajo obligatoria para todo el personal asistencial y administrativo, garantizando la trazabilidad de historias clínicas, la precisión en facturación y el cumplimiento de las normativas de acreditación hospitalaria ITAES.
                            </p>
                        </div>

                        <div>
                            <h3 style={{ fontSize: '13px', fontWeight: 'bold', margin: '0 0 6px 0' }}>2. CAMPO DE APLICACIÓN Y ALCANCE:</h3>
                            <p style={{ margin: 0, paddingLeft: '14px', textAlign: 'justify', color: '#1F2937' }}>
                                Este manual es de aplicación directa y obligatoria para las áreas de: Innovación y Transformación Digital, Admisión Central y Quirúrgica, Recepción y Gestión de Turnos, Control de Altas Administrativas, Facturación Internado, Quirófanos Centrales, Laboratorios de Anatomía Patológica, Auditoría Médica y Recuperación de Cuentas del Sanatorio Argentino SRL.
                            </p>
                        </div>

                        <div>
                            <h3 style={{ fontSize: '13px', fontWeight: 'bold', margin: '0 0 6px 0' }}>3. DEFINICIONES Y GLOSARIO DE TÉRMINOS:</h3>
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
                            <h3 style={{ fontSize: '13px', fontWeight: 'bold', margin: '0 0 6px 0' }}>4. ARQUITECTURA GENERAL Y ACCESO:</h3>
                            <p style={{ margin: '0 0 6px 0', paddingLeft: '14px', color: '#1F2937' }}>
                                El sistema opera bajo arquitectura moderna cloud-edge conectada en tiempo real mediante Supabase (PostgreSQL) y el servicio local de sincronización con SALUS.
                            </p>
                            <ul style={{ margin: 0, paddingLeft: '32px', display: 'flex', flexDirection: 'column', gap: '4px', color: '#1F2937' }}>
                                <li><strong>Acceso de Usuarios:</strong> Inicio de sesión mediante usuario institucional o correo @sanatorioargentino.com.ar.</li>
                                <li><strong>Atajo Global:</strong> Combinación <code>Ctrl + K</code> para abrir la Paleta de Comandos y asistente Beto IA.</li>
                                <li><strong>Configuración Personalizada:</strong> Cada colaborador configura los módulos visibles según su función.</li>
                            </ul>
                        </div>

                        <div>
                            <h3 style={{ fontSize: '13px', fontWeight: 'bold', margin: '0 0 6px 0' }}>5. PROCEDIMIENTOS OPERATIVOS DETALLADOS POR MÓDULO:</h3>
                            <div style={{ paddingLeft: '14px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                
                                {/* 5.1 */}
                                <div>
                                    <strong style={{ color: '#1E5799', fontSize: '13px' }}>5.1 Cirugías y Triage Quirúrgico (SurgeriesPanel):</strong>
                                    <p style={{ margin: '3px 0 6px 0', color: '#374151' }}>
                                        Centraliza la programación quirúrgica diaria. Permite auditar el cumplimiento prequirúrgico mediante un pipeline por colores:
                                    </p>
                                    <ul style={{ margin: 0, paddingLeft: '24px', color: '#374151' }}>
                                        <li><strong>Lila:</strong> Sin mensaje inicial enviado (verificar número telefónico).</li>
                                        <li><strong>Amarillo:</strong> Mensaje prequirúrgico emitido (esperando órdenes y estudios).</li>
                                        <li><strong>Verde:</strong> Cobertura validada y quirófano reservado.</li>
                                        <li><strong>Azul:</strong> Paciente confirmó asistencia efectiva y ayuno reglamentario.</li>
                                        <li><strong>Rojo:</strong> Cirugía reprogramada o suspendida.</li>
                                    </ul>
                                    <p style={{ margin: '4px 0 0 0', color: '#374151' }}>
                                        <strong>Triage de Fojas:</strong> Carga de la foja quirúrgica en PDF/imagen con extracción inteligente de insumos implantados (mallas, suturas, prótesis) y detección de piezas para biopsias de anatomía patológica.
                                    </p>
                                </div>

                                {/* 5.2 */}
                                <div>
                                    <strong style={{ color: '#1E5799', fontSize: '13px' }}>5.2 Cola de Turnos y Boxes de Recepción (TurnoAdminPanel / TurnoKiosco):</strong>
                                    <p style={{ margin: '3px 0', color: '#374151' }}>
                                        Administra el tótem de autoservicio para pacientes (Categorías: Admisión, Quirófano, Consultas, Guardias, Entrega de Estudios), llamador central audiovisual con campana y voz sintetizada, y panel de atención para recepcionistas en Boxes 1 al 8.
                                    </p>
                                </div>

                                {/* 5.3 */}
                                <div>
                                    <strong style={{ color: '#1E5799', fontSize: '13px' }}>5.3 Control de Altas Administrativas (AltasPanel):</strong>
                                    <p style={{ margin: '3px 0', color: '#374151' }}>
                                        Auditoría obligatoria de internaciones. Incluye paginación ágil x10, auto-mapeo a <code>Particular</code> para <code>042 - PARTICULARES</code> y pacientes particulares, fusión inteligente de duplicados con badge <code>[🔗 Fusionada]</code>, control de internaciones prolongadas (Cruza Mes) y Carrito de Traspaso a Facturación con código oficial <code>TRASP-YYYYMMDD-XXXX</code> y firmas digitales en pantalla.
                                    </p>
                                </div>

                                {/* 5.4 */}
                                <div>
                                    <strong style={{ color: '#1E5799', fontSize: '13px' }}>5.4 Facturación Internado y Devoluciones (FacturacionPanel):</strong>
                                    <p style={{ margin: '3px 0', color: '#374151' }}>
                                        Recepción de expedientes transferidos para liquidación, asignación de analistas (Jorge Terrera, Paola Illanes, Inés Dona, etc.), detección automática de facturas de SALUS (PDV 21/31) y circuito de devoluciones a Control de Altas con motivo especificado y remito firmado.
                                    </p>
                                </div>

                                {/* 5.5 */}
                                <div>
                                    <strong style={{ color: '#1E5799', fontSize: '13px' }}>5.5 Asistente Inteligente Beto IA (BetoWidget / BetoAnalytics):</strong>
                                    <p style={{ margin: '3px 0', color: '#374151' }}>
                                        Asistente virtual de IA exclusivo de ADM-QUI. Responde consultas en lenguaje natural, genera reportes instantáneos en PDF, exporta a Excel y se activa globalmente con <code>Ctrl + K</code>.
                                    </p>
                                </div>

                                {/* 5.6 */}
                                <div>
                                    <strong style={{ color: '#1E5799', fontSize: '13px' }}>5.6 Deudas, Presupuestos y Mensajería Multilínea:</strong>
                                    <p style={{ margin: '3px 0', color: '#374151' }}>
                                        Gestión de saldos deudores de pacientes, cotización formal de presupuestos quirúrgicos en PDF con validez legal y mensajería multilínea (Línea Estándar y Meta Cloud API con control estricto de la ventana de 24 horas y plantillas aprobadas).
                                    </p>
                                </div>

                                {/* 5.7 */}
                                <div>
                                    <strong style={{ color: '#1E5799', fontSize: '13px' }}>5.7 Asociaciones, Laboratorios de Anatomía Patológica y Activos QR:</strong>
                                    <p style={{ margin: '3px 0', color: '#374151' }}>
                                        Agrupación y actas de entrega de fojas para Asociaciones Médicas, trazabilidad de muestras de biopsia con reglas <code>Facturar</code> vs <code>Entregar</code> (CEDAP, Agüero, Ríos, Cuyo) e inventario de aparatología médica con etiquetas de código QR para auditoría física.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div>
                            <h3 style={{ fontSize: '13px', fontWeight: 'bold', margin: '0 0 6px 0' }}>6. PLAN DE CONTINGENCIA ANTE FALLAS DE SISTEMA:</h3>
                            <table style={{ width: '100%', borderCollapse: 'collapse', border: '1.5px solid #000', fontSize: '11px' }}>
                                <thead>
                                    <tr style={{ background: '#E5E7EB' }}>
                                        <th style={{ border: '1px solid #000', padding: '4px 8px', textAlign: 'left', width: '30%' }}>Incidencia Técnica</th>
                                        <th style={{ border: '1px solid #000', padding: '4px 8px', textAlign: 'left', width: '50%' }}>Procedimiento de Contingencia</th>
                                        <th style={{ border: '1px solid #000', padding: '4px 8px', textAlign: 'center', width: '20%' }}>Responsable</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td style={{ border: '1px solid #000', padding: '4px 8px', fontWeight: 'bold' }}>Caída de sync-server SALUS</td>
                                        <td style={{ border: '1px solid #000', padding: '4px 8px' }}>Ejecutar script local "Actualizar SALUS.bat" y verificar log de conexión SQL</td>
                                        <td style={{ border: '1px solid #000', padding: '4px 8px', textAlign: 'center' }}>Operador / Innovación</td>
                                    </tr>
                                    <tr>
                                        <td style={{ border: '1px solid #000', padding: '4px 8px', fontWeight: 'bold' }}>Corte de conectividad a Internet</td>
                                        <td style={{ border: '1px solid #000', padding: '4px 8px' }}>Registrar admisiones en planillas de contingencia manual hasta restablecimiento</td>
                                        <td style={{ border: '1px solid #000', padding: '4px 8px', textAlign: 'center' }}>Personal de Admisión</td>
                                    </tr>
                                    <tr>
                                        <td style={{ border: '1px solid #000', padding: '4px 8px', fontWeight: 'bold' }}>Expiración ventana 24hs WhatsApp</td>
                                        <td style={{ border: '1px solid #000', padding: '4px 8px' }}>Utilizar exclusivamente plantillas oficiales HSM aprobadas en el módulo de Mensajería</td>
                                        <td style={{ border: '1px solid #000', padding: '4px 8px', textAlign: 'center' }}>Operador Mensajería</td>
                                    </tr>
                                    <tr>
                                        <td style={{ border: '1px solid #000', padding: '4px 8px', fontWeight: 'bold' }}>Falla de pantalla de turnos</td>
                                        <td style={{ border: '1px solid #000', padding: '4px 8px' }}>Realizar llamado a viva voz indicando número de turno y Box correspondiente</td>
                                        <td style={{ border: '1px solid #000', padding: '4px 8px', textAlign: 'center' }}>Recepción Central</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* Pie de Firmas Oficial */}
                <div style={{ marginTop: '30px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', border: '1.5px solid #000', fontSize: '11px' }}>
                        <tbody>
                            <tr style={{ height: '90px' }}>
                                <td style={{ border: '1.5px solid #000', width: '33.33%', padding: '6px', verticalAlign: 'top', position: 'relative' }}>
                                    <div style={{ fontSize: '10px', fontWeight: 'normal' }}>ELABORADO:</div>
                                    <div style={{ position: 'absolute', bottom: '8px', left: 0, right: 0, textAlign: 'center' }}>
                                        <div style={{ fontWeight: 'bold', fontSize: '12px' }}>{DOC_META.elaboro}</div>
                                        <div style={{ fontSize: '9.5px', color: '#4B5563', marginTop: '2px' }}>{DOC_META.elaboroCargo}</div>
                                    </div>
                                </td>
                                <td style={{ border: '1.5px solid #000', width: '33.33%', padding: '6px', verticalAlign: 'top', position: 'relative' }}>
                                    <div style={{ fontSize: '10px', fontWeight: 'normal' }}>REVISADO:</div>
                                    <div style={{ position: 'absolute', bottom: '8px', left: 0, right: 0, textAlign: 'center' }}>
                                        <div style={{ fontWeight: 'bold', fontSize: '12px' }}>{DOC_META.reviso}</div>
                                        <div style={{ fontSize: '9.5px', color: '#4B5563', marginTop: '2px' }}>{DOC_META.revisoCargo}</div>
                                    </div>
                                </td>
                                <td style={{ border: '1.5px solid #000', width: '33.33%', padding: '6px', verticalAlign: 'top', position: 'relative' }}>
                                    <div style={{ fontSize: '10px', fontWeight: 'normal' }}>APROBADO:</div>
                                    <div style={{ position: 'absolute', bottom: '8px', left: 0, right: 0, textAlign: 'center' }}>
                                        <div style={{ fontWeight: 'bold', fontSize: '12px' }}>{DOC_META.aprobo}</div>
                                        <div style={{ fontSize: '9.5px', color: '#4B5563', marginTop: '2px' }}>{DOC_META.aproboCargo}</div>
                                    </div>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <style>{`
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                @media print {
                    body { background: white !important; padding: 0 !important; }
                    button, .no-print { display: none !important; }
                }
            `}</style>
        </div>
    );
}
