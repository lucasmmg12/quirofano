/**
 * ManualProcedimientos.jsx
 * Instructivo / Manual de Procedimientos Operativos — Sistema ADM-QUI
 * Estructura Oficial del Sistema de Gestión de la Calidad (SGC) / Normas ITAES
 * Sanatorio Argentino SRL
 * 
 * Elaborado por: Lucas Marinero (Responsable de Innovación y Transformación Digital)
 * Revisado por: Gabriela Iragorre (Responsable Documentos SGC)
 * Aprobado por: Dr. Carlos Buteler (Director Médico)
 */

import React, { useState } from 'react';
import { BookOpen, Download, Printer, Loader2, CheckCircle2, FileText, Eye, ShieldCheck, Sparkles, User, Calendar, Award } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ─── Metadatos Institucionales Oficiales SGC ────────────────────────────────
export const DOC_META = {
    codigo: 'ITYS 23',
    revision: '01',
    version: '1.1',
    fechaVigencia: '27/08/2026',
    estado: 'Vigente — Aprobado SGC',
    titulo: 'SISTEMA ADM-QUI — GESTIÓN INTEGRAL DE ADMISIÓN, CIRUGÍAS Y ALTAS',
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

/**
 * Dibuja la marca de agua diagonal institucional
 */
function drawWatermark(doc) {
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    doc.saveGraphicsState();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(36);
    doc.setTextColor(230, 235, 242);
    doc.text('SANATORIO ARGENTINO', W / 2, H / 2, {
        align: 'center',
        angle: 45,
    });
    doc.restoreGraphicsState();
}

/**
 * Dibuja el encabezado institucional en tabla de 3 columnas
 */
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
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('INSTRUCTIVO:', ML + 52, 14.5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
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

function addPage(doc, counters) {
    doc.addPage();
    counters.page += 1;
    drawHeader(doc, counters.page, '{total_pages_count_string}');
    return 40;
}

function sectionTitle(doc, text, y) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(0, 0, 0);
    doc.text(text.toUpperCase(), 14, y + 5);
    return y + 8.5;
}

function subTitle(doc, text, y) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(30, 87, 153);
    doc.text(text, 14 + 3, y + 4);
    return y + 7.5;
}

function para(doc, text, y, indent = 14) {
    const W = doc.internal.pageSize.getWidth();
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.textMain);
    const lines = doc.splitTextToSize(text, W - indent - 14);
    doc.text(lines, indent, y);
    return y + lines.length * 4.2 + 2;
}

function bulletList(doc, items, y, indent = 20) {
    const W = doc.internal.pageSize.getWidth();
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.textMain);
    for (const item of items) {
        doc.setFont('helvetica', 'bold');
        doc.setFillColor(...COLORS.primaryMid);
        doc.circle(indent - 4, y - 1, 0.8, 'F');
        doc.setFont('helvetica', 'normal');
        const lines = doc.splitTextToSize(item, W - indent - 14);
        doc.text(lines, indent, y);
        y += lines.length * 4.2 + 1.2;
    }
    return y + 2;
}

function noteBox(doc, text, y) {
    const W = doc.internal.pageSize.getWidth();
    const CW = W - 28;
    const ML = 14;
    let lines = doc.splitTextToSize(text, CW - 12);
    const boxH = lines.length * 4.2 + 8;

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.rect(ML, y, CW, boxH, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(30, 87, 153);
    doc.text('[NOTA / OBSERVACIÓN OPERATIVA]', ML + 4, y + 5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    doc.text(lines, ML + 4, y + 9.5);
    return y + boxH + 3.5;
}

function drawSignatures(doc, y) {
    const W = doc.internal.pageSize.getWidth();
    const CW = W - 28;
    const ML = 14;
    const colW = CW / 3;

    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.setTextColor(0, 0, 0);

    // Encabezados
    doc.setFillColor(235, 238, 242);
    doc.rect(ML, y, colW, 5, 'FD');
    doc.rect(ML + colW, y, colW, 5, 'FD');
    doc.rect(ML + colW * 2, y, colW, 5, 'FD');

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.text('ELABORADO:', ML + 2, y + 3.5);
    doc.text('REVISADO:', ML + colW + 2, y + 3.5);
    doc.text('APROBADO:', ML + colW * 2 + 2, y + 3.5);

    // Cajas de firma
    doc.rect(ML, y + 5, colW, 22, 'S');
    doc.rect(ML + colW, y + 5, colW, 22, 'S');
    doc.rect(ML + colW * 2, y + 5, colW, 22, 'S');

    // Elaborado
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text(DOC_META.elaboro, ML + colW / 2, y + 17, { align: 'center' });
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.text(DOC_META.elaboroCargo, ML + colW / 2, y + 21, { align: 'center' });

    // Revisado
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text(DOC_META.reviso, ML + colW + colW / 2, y + 17, { align: 'center' });
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.text(DOC_META.revisoCargo, ML + colW + colW / 2, y + 21, { align: 'center' });

    // Aprobado
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text(DOC_META.aprobo, ML + colW * 2 + colW / 2, y + 17, { align: 'center' });
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.text(DOC_META.aproboCargo, ML + colW * 2 + colW / 2, y + 21, { align: 'center' });

    return y + 28;
}

/**
 * Generador principal del PDF Oficial conforme al formato SGC
 */
export async function generateManualPDF() {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const counters = { page: 1 };
    
    // Página 1: Encabezado SGC + Tablas de Control + Secciones Iniciales
    drawHeader(doc, 1, '{total_pages_count_string}');
    let y = 38;

    // ── Tabla 1: REVISIONES ──
    autoTable(doc, {
        startY: y,
        margin: { left: 14, right: 14 },
        head: [
            [{ content: 'REVISIONES', colSpan: 4, styles: { halign: 'left', fillColor: [235, 238, 242], textColor: [0, 0, 0], fontStyle: 'bold' } }],
            ['N°', 'Descripción de los cambios', 'Autor', 'Fecha vigencia']
        ],
        body: [
            ['00', 'Versión original del sistema de admisión quirúrgica', 'Lucas Marinero', '20/03/2024'],
            ['01', 'Actualización integral de módulos, control de altas, cola de turnos, particulares 042 y facturación', 'Lucas Marinero', DOC_META.fechaVigencia]
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
        styles: { cellPadding: 1.8 }
    });

    y = doc.lastAutoTable.finalY + 4;

    // ── Tabla 2: DOCUMENTOS DE REFERENCIA ──
    autoTable(doc, {
        startY: y,
        margin: { left: 14, right: 14 },
        head: [
            [{ content: 'DOCUMENTOS DE REFERENCIA', colSpan: 2, styles: { halign: 'left', fillColor: [235, 238, 242], textColor: [0, 0, 0], fontStyle: 'bold' } }],
            ['Código', 'Título del documento']
        ],
        body: [
            ['SGC-PR-01', 'Manual del Sistema de Gestión de la Calidad (SGC) — Sanatorio Argentino'],
            ['ITYS-05', 'Procedimiento Operativo de Seguridad, Acceso y Confidencialidad en Sistemas de Salud'],
            ['ADM-QUI-02', 'Procedimiento de Admisión Quirúrgica y Circuito de Triage de Fojas']
        ],
        theme: 'plain',
        headStyles: { fontSize: 7, fontStyle: 'bold', fillColor: [245, 247, 250], textColor: [0, 0, 0], halign: 'center', lineWidth: 0.3, lineColor: [0, 0, 0] },
        bodyStyles: { fontSize: 7, textColor: [0, 0, 0], lineWidth: 0.3, lineColor: [0, 0, 0] },
        columnStyles: {
            0: { halign: 'center', cellWidth: 40 },
            1: { cellWidth: 142 },
        },
        styles: { cellPadding: 1.8 }
    });

    y = doc.lastAutoTable.finalY + 5;

    // ── 1. OBJETIVO ──
    y = sectionTitle(doc, '1. OBJETIVO:', y);
    y = para(doc, 'Definir los pasos, pautas y controles operativos para la correcta administración, gestión de cirugías, control de altas administrativas, trazabilidad de historias clínicas, cola de turnos y facturación dentro del Sistema de Admisión Quirúrgica (ADM-QUI) del Sanatorio Argentino. Este instructivo garantiza la estandarización de procesos conforme a los requerimientos de acreditación hospitalaria ITAES y normativas de calidad vigentes.', y + 1);

    // ── 2. CAMPO DE APLICACIÓN ──
    y += 2;
    y = sectionTitle(doc, '2. CAMPO DE APLICACIÓN:', y);
    y = para(doc, 'El presente instructivo se aplicará al personal de Innovación y Transformación Digital, Admisión Quirúrgica, Recepción Central, Control de Altas Administrativas, Facturación Internado, Quirófano, Auditoría Médica y todo usuario de salud que opere el Sistema ADM-QUI en sus tareas diarias.', y + 1);

    // ── 3. DEFINICIONES ──
    y += 2;
    y = sectionTitle(doc, '3. DEFINICIONES:', y);
    y = bulletList(doc, [
        'ADM-QUI: Sistema Integral de Admisión Quirúrgica y Control Administrativo de Sanatorio Argentino.',
        'SALUS: Sistema hospitalario central (SQL Server) fuente de datos clínicos y admisiones.',
        'BETO IA: Asistente virtual de Inteligencia Artificial exclusivo del sistema ADM-QUI para soporte y analítica.',
        'CONTROL DE ALTAS: Auditoría administrativa previa al traspaso de expedientes hospitalarios a Facturación.',
        'PARTICULAR (042): Paciente sin cobertura médica o cuyo cliente figure con su propio nombre (mapeo automático).',
        'TRASPASO: Remito formal generado desde el Carrito con código oficial (TRASP-YYYYMMDD-XXXX) y firmas.',
        'COLA DE TURNOS: Sistema de tótem interactivo y llamador a boxes de atención de recepción.',
        'TRIAGE FOJA: Extracción y categorización automática de insumos y biopsias desde la foja quirúrgica.',
        'LUP: Lección de Un Punto (instructivo rápido, gráfico y focalizado).',
        'SGC: Sistema de Gestión de la Calidad del Sanatorio Argentino SRL.'
    ], y);

    // ── 4. DIAGRAMA DE FLUJO DEL PROCESO ──
    y = (y + 40 > doc.internal.pageSize.getHeight() - 40) ? addPage(doc, counters) : y;
    y = sectionTitle(doc, '4. DIAGRAMA DE FLUJO GENERAL DEL PROCESO:', y);
    y = bulletList(doc, [
        '1. Sincronización en tiempo real desde SALUS hacia Supabase (Cirugías, Admisiones, Pacientes).',
        '2. Gestión y confirmación de cirugías mediante pipeline de WhatsApp y triage de fojas.',
        '3. Recepción de pacientes en sala mediante tótem de turnos y derivación a box libre.',
        '4. Auditoría de internaciones en Control de Altas (revisión de responsables, estados y 042 Particulares).',
        '5. Traspaso formal de expedientes a Facturación mediante remito digital firmado.',
        '6. Facturación en SALUS y marcación automática/manual de fichas facturadas o devueltas.'
    ], y);

    // ── 5. PROCEDIMIENTO DETALLADO POR MÓDULO ──
    y = addPage(doc, counters);
    y = sectionTitle(doc, '5. PROCEDIMIENTO OPERATIVO DETALLADO POR MÓDULO:', y);

    // 5.1 Cirugías y Triage
    y = subTitle(doc, '5.1 Panel de Cirugías y Triage Quirúrgico (SurgeriesPanel)', y);
    y = para(doc, 'Centraliza la programación quirúrgica extraída de SALUS. Permite enviar mensajes automáticos de preparación prequirúrgica por WhatsApp mediante un pipeline de estados codificado por colores:', y + 1);
    y = bulletList(doc, [
        'Lila: Sin mensaje enviado (estado inicial tras la sincronización).',
        'Amarillo: En revisión (mensaje prequirúrgico enviado, esperando documentación).',
        'Verde: Autorizada por administración (esperando confirmación del paciente).',
        'Azul: Confirmada (el paciente confirmó asistencia efectiva al quirófano).',
        'Rojo / Precaución: Alerta por documentación incompleta o reprogramación.',
        'Triage Foja Quirúrgica: Carga de fojas con extracción automática de insumos y biopsias remetidas.'
    ], y);

    // 5.2 Cola de Turnos
    y += 2;
    y = (y + 40 > doc.internal.pageSize.getHeight() - 40) ? addPage(doc, counters) : y;
    y = subTitle(doc, '5.2 Cola de Turnos y Boxes de Recepción (TurnoAdminPanel / TurnoKiosco)', y);
    y = para(doc, 'Gestiona el flujo de recepción y atención al público:', y + 1);
    y = bulletList(doc, [
        'Tótem de autoservicio: El paciente presiona la pantalla táctil para obtener número según categoría.',
        'Pantalla llamadora: Anuncia visual y acústicamente (voz + campana) el turno y box asignado.',
        'Panel de administración: Recepcionistas gestionan estados (esperando, llamado, atendiendo, finalizado, ausente).'
    ], y);

    // 5.3 Altas Administrativas
    y += 2;
    y = (y + 40 > doc.internal.pageSize.getHeight() - 40) ? addPage(doc, counters) : y;
    y = subTitle(doc, '5.3 Control de Altas Administrativas e Internaciones (AltasPanel)', y);
    y = para(doc, 'Control y auditoría de todas las admisiones hospitalarias del Sanatorio Argentino:', y + 1);
    y = bulletList(doc, [
        'Paginación predeterminada: Visualización fluida de a 10 filas por página.',
        'Mapeo automático de Particulares: Si el cliente es "042 - PARTICULARES" o el nombre del paciente, el sistema asigna automáticamente el estado "Particular".',
        'Estados disponibles: Alta Adm (finalizada), Alta Adm. Parcial, Particular, Suspendida, Pasa al mes que viene, Interconsulta, Vacío.',
        'Fusión de duplicados: Fusión inteligente de registros con misma fecha e ingreso para evitar doble cómputo.',
        'Carrito de Traspaso: Agrupación de fichas para emisión de remito formal a Facturación con firmas.',
        'Métricas BI: Tablero analítico con distribución de estados, promedios de días y gráficos dinámicos.'
    ], y);

    // 5.4 Facturación Internado
    y += 2;
    y = (y + 40 > doc.internal.pageSize.getHeight() - 40) ? addPage(doc, counters) : y;
    y = subTitle(doc, '5.4 Facturación Internado y Devoluciones (FacturacionPanel)', y);
    y = para(doc, 'Recepción de expedientes transferidos desde Altas Adm para su liquidación final. Permite marcar como Facturada o generar remito de Devolución con motivo específico hacia Control de Altas.', y + 1);

    // 5.5 Asistente Beto IA
    y += 2;
    y = (y + 40 > doc.internal.pageSize.getHeight() - 40) ? addPage(doc, counters) : y;
    y = subTitle(doc, '5.5 Asistente Virtual Beto IA (BetoWidget / BetoPanel)', y);
    y = para(doc, 'Beto es el asistente de inteligencia artificial exclusivo de ADM-QUI. Capacidades principales:', y + 1);
    y = bulletList(doc, [
        'Consultas de datos en lenguaje natural sobre cualquier módulo del sistema.',
        'Generación de reportes inmediatos en formato PDF profesional y exportación a Excel.',
        'Atajo de teclado universal Ctrl+K (Command Palette) para navegación y consultas veloces.',
        'Visualización de métricas de uso y rendimiento en Beto Analytics.'
    ], y);

    // ── 6. PLAN DE CONTINGENCIA ──
    y = addPage(doc, counters);
    y = sectionTitle(doc, '6. PLAN DE CONTINGENCIA ANTE FALLAS DE SISTEMA:', y);
    y = para(doc, 'Ante contingencias técnicas, el personal debe aplicar las siguientes pautas inmediatas:', y + 1);
    autoTable(doc, {
        startY: y,
        margin: { left: 14, right: 14 },
        head: [['Tipo de Contingencia', 'Acción Inmediata', 'Responsable']],
        body: [
            ['Caída de sync-server SALUS', 'Verificar servicio local con "Actualizar SALUS.bat" y notificar a Innovación', 'Operador / Innovación'],
            ['Corte de conectividad a Internet', 'Operar en planillas de contingencia manuales hasta restablecimiento', 'Personal de Admisión'],
            ['Expiración ventana WhatsApp (24hs Meta)', 'Utilizar plantillas oficiales aprobadas desde el panel de Mensajería', 'Operador de Mensajería'],
            ['Fallo en llamadas de turnos', 'Llamado a viva voz indicando número de turno y box', 'Recepción']
        ],
        theme: 'plain',
        headStyles: { fontSize: 7, fontStyle: 'bold', fillColor: [235, 238, 242], textColor: [0, 0, 0], halign: 'center', lineWidth: 0.3, lineColor: [0, 0, 0] },
        bodyStyles: { fontSize: 7, textColor: [0, 0, 0], lineWidth: 0.3, lineColor: [0, 0, 0] },
        columnStyles: {
            0: { fontStyle: 'bold', cellWidth: 50 },
            1: { cellWidth: 92 },
            2: { halign: 'center', cellWidth: 40 },
        },
        styles: { cellPadding: 2 }
    });

    y = doc.lastAutoTable.finalY + 6;
    y = noteBox(doc, 'El presente documento es de cumplimiento obligatorio. Cualquier modificación debe ser canalizada mediante solicitud formal al Departamento de Innovación y Transformación Digital y aprobada por la Dirección Médica conforme a las normas SGC.', y);

    // Bloque de firmas final
    y = (y + 35 > doc.internal.pageSize.getHeight() - 40) ? addPage(doc, counters) : y;
    drawSignatures(doc, y + 6);

    doc.putTotalPages('{total_pages_count_string}');
    doc.save(`Instructivo_${DOC_META.codigo.replace(/\s+/g, '_')}_ADM-QUI_v${DOC_META.version}.pdf`);
}

// ─── Componente React Principal ─────────────────────────────────────────────
export default function ManualProcedimientos() {
    const [viewMode, setViewMode] = useState('preview'); // 'preview' | 'info'
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
            background: '#F1F5F9',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            fontFamily: 'Inter, system-ui, -apple-system, sans-serif'
        }}>
            {/* Barra superior de acciones */}
            <div style={{
                width: '100%',
                maxWidth: '900px',
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
                            Instructivo SGC — Sistema ADM-QUI
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
                                Descargar PDF Oficial
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Hoja A4 interactiva en pantalla (reproducción exacta del formato oficial de la imagen) */}
            <div style={{
                width: '100%',
                maxWidth: '900px',
                background: '#FFFFFF',
                borderRadius: '4px',
                boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
                border: '1px solid #D1D5DB',
                padding: '40px',
                position: 'relative',
                overflow: 'hidden',
                color: '#000000',
                fontSize: '13px',
                lineHeight: 1.5
            }}>
                {/* Marca de agua diagonal */}
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

                {/* ── ENCABEZADO OFICIAL EN TABLA DE 3 COLUMNAS ── */}
                <table style={{ width: '100%', borderCollapse: 'collapse', border: '1.5px solid #000', marginBottom: '16px' }}>
                    <tbody>
                        <tr>
                            {/* Columna 1: Logo e Identificación */}
                            <td style={{ border: '1.5px solid #000', width: '25%', padding: '8px', textAlign: 'center', verticalAlign: 'middle' }}>
                                <div style={{ fontSize: '11px', fontWeight: 'bold', lineHeight: '1.2' }}>
                                    SANATORIO<br />ARGENTINO SRL
                                </div>
                                <hr style={{ border: 'none', borderTop: '1px solid #000', margin: '6px 0' }} />
                                <div style={{ fontSize: '9px', fontWeight: 'bold', lineHeight: '1.2' }}>
                                    {DOC_META.departamento}
                                </div>
                            </td>

                            {/* Columna 2: INSTRUCTIVO + TÍTULO */}
                            <td style={{ border: '1.5px solid #000', width: '50%', padding: '8px', textAlign: 'center', verticalAlign: 'middle' }}>
                                <div style={{ fontSize: '11px', fontWeight: 'normal', letterSpacing: '0.05em' }}>INSTRUCTIVO:</div>
                                <div style={{ fontSize: '13px', fontWeight: 'bold', marginTop: '4px' }}>
                                    {DOC_META.titulo}
                                </div>
                            </td>

                            {/* Columna 3: CÓDIGO + REVISIÓN + PÁGINA */}
                            <td style={{ border: '1.5px solid #000', width: '25%', padding: '8px', textAlign: 'center', verticalAlign: 'middle' }}>
                                <div style={{ fontSize: '18px', fontWeight: 'bold', letterSpacing: '0.05em' }}>{DOC_META.codigo}</div>
                                <div style={{ fontSize: '11px', marginTop: '2px' }}>Revisión Nº {DOC_META.revision}</div>
                                <div style={{ fontSize: '10px', marginTop: '2px', color: '#4B5563' }}>Pág. 1 de 4</div>
                            </td>
                        </tr>

                        {/* Fila Inferior de Validez */}
                        <tr>
                            <td colSpan={3} style={{ border: '1.5px solid #000', background: '#E5E7EB', padding: '4px', textAlign: 'center', fontSize: '10px', fontWeight: 'bold' }}>
                                VALIDO SOLO EN FORMATO ELECTRÓNICO – LAS COPIAS EN PAPEL CARECEN DE VALOR
                            </td>
                        </tr>
                    </tbody>
                </table>

                {/* ── TABLA DE REVISIONES ── */}
                <table style={{ width: '100%', borderCollapse: 'collapse', border: '1.5px solid #000', marginBottom: '14px', fontSize: '11px' }}>
                    <thead>
                        <tr>
                            <th colSpan={4} style={{ border: '1px solid #000', background: '#E5E7EB', padding: '4px 8px', textAlign: 'left', fontWeight: 'bold' }}>
                                REVISIONES
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
                            <td style={{ border: '1px solid #000', padding: '4px 8px' }}>Versión original del sistema de admisión quirúrgica</td>
                            <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center' }}>Lucas Marinero</td>
                            <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center' }}>20/03/2024</td>
                        </tr>
                        <tr>
                            <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center' }}>01</td>
                            <td style={{ border: '1px solid #000', padding: '4px 8px' }}>Actualización integral de módulos, control de altas, cola de turnos, particulares 042 y facturación</td>
                            <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center' }}>Lucas Marinero</td>
                            <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center' }}>{DOC_META.fechaVigencia}</td>
                        </tr>
                    </tbody>
                </table>

                {/* ── TABLA DE DOCUMENTOS DE REFERENCIA ── */}
                <table style={{ width: '100%', borderCollapse: 'collapse', border: '1.5px solid #000', marginBottom: '20px', fontSize: '11px' }}>
                    <thead>
                        <tr>
                            <th colSpan={2} style={{ border: '1px solid #000', background: '#E5E7EB', padding: '4px 8px', textAlign: 'left', fontWeight: 'bold' }}>
                                DOCUMENTOS DE REFERENCIA
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
                            <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center' }}>ITYS-05</td>
                            <td style={{ border: '1px solid #000', padding: '4px 8px' }}>Procedimiento Operativo de Seguridad, Acceso y Confidencialidad en Sistemas de Salud</td>
                        </tr>
                        <tr>
                            <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center' }}>ADM-QUI-02</td>
                            <td style={{ border: '1px solid #000', padding: '4px 8px' }}>Procedimiento de Admisión Quirúrgica y Circuito de Triage de Fojas</td>
                        </tr>
                    </tbody>
                </table>

                {/* ── CUERPO DEL INSTRUCTIVO (SECCIONES FORMALES) ── */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div>
                        <h3 style={{ fontSize: '13px', fontWeight: 'bold', margin: '0 0 6px 0' }}>1. OBJETIVO:</h3>
                        <p style={{ margin: 0, paddingLeft: '14px', textAlign: 'justify', color: '#1F2937' }}>
                            Definir los pasos, pautas y controles operativos para la correcta administración, gestión de cirugías, control de altas administrativas, trazabilidad de historias clínicas, cola de turnos y facturación dentro del Sistema de Admisión Quirúrgica (ADM-QUI) del Sanatorio Argentino. Este instructivo garantiza la estandarización de procesos conforme a los requerimientos de acreditación hospitalaria ITAES y normativas de calidad vigentes.
                        </p>
                    </div>

                    <div>
                        <h3 style={{ fontSize: '13px', fontWeight: 'bold', margin: '0 0 6px 0' }}>2. CAMPO DE APLICACIÓN:</h3>
                        <p style={{ margin: 0, paddingLeft: '14px', textAlign: 'justify', color: '#1F2937' }}>
                            El presente instructivo se aplicará al personal de Innovación y Transformación Digital, Admisión Quirúrgica, Recepción Central, Control de Altas Administrativas, Facturación Internado, Quirófano, Auditoría Médica y todo usuario de salud que opere el Sistema ADM-QUI en sus tareas diarias.
                        </p>
                    </div>

                    <div>
                        <h3 style={{ fontSize: '13px', fontWeight: 'bold', margin: '0 0 6px 0' }}>3. DEFINICIONES:</h3>
                        <ul style={{ margin: 0, paddingLeft: '32px', display: 'flex', flexDirection: 'column', gap: '4px', color: '#1F2937' }}>
                            <li><strong>ADM-QUI:</strong> Sistema Integral de Admisión Quirúrgica y Control Administrativo de Sanatorio Argentino.</li>
                            <li><strong>SALUS:</strong> Sistema hospitalario central (SQL Server) fuente de datos clínicos y admisiones.</li>
                            <li><strong>BETO IA:</strong> Asistente virtual de Inteligencia Artificial exclusivo del sistema ADM-QUI para soporte, navegación y analítica.</li>
                            <li><strong>CONTROL DE ALTAS:</strong> Auditoría administrativa previa al traspaso de expedientes hospitalarios a Facturación.</li>
                            <li><strong>PARTICULAR (042):</strong> Paciente sin cobertura médica o cuyo cliente figure con su propio nombre (mapeo automático).</li>
                            <li><strong>TRASPASO:</strong> Remito formal generado desde el Carrito con código oficial (TRASP-YYYYMMDD-XXXX) y firmas.</li>
                            <li><strong>COLA DE TURNOS:</strong> Sistema de tótem interactivo y llamador a boxes de atención de recepción.</li>
                            <li><strong>TRIAGE FOJA:</strong> Extracción y categorización automática de insumos y biopsias desde la foja quirúrgica.</li>
                            <li><strong>LUP:</strong> Lección de Un Punto (instructivo rápido, gráfico y focalizado).</li>
                            <li><strong>SGC:</strong> Sistema de Gestión de la Calidad del Sanatorio Argentino SRL.</li>
                        </ul>
                    </div>

                    <div>
                        <h3 style={{ fontSize: '13px', fontWeight: 'bold', margin: '0 0 6px 0' }}>4. DIAGRAMA DE FLUJO GENERAL DEL PROCESO:</h3>
                        <ol style={{ margin: 0, paddingLeft: '32px', display: 'flex', flexDirection: 'column', gap: '4px', color: '#1F2937' }}>
                            <li>Sincronización en tiempo real desde SALUS hacia Supabase (Cirugías, Admisiones, Pacientes).</li>
                            <li>Gestión y confirmación de cirugías mediante pipeline de WhatsApp y triage de fojas.</li>
                            <li>Recepción de pacientes en sala mediante tótem de turnos y derivación a box libre.</li>
                            <li>Auditoría de internaciones en Control de Altas (revisión de responsables, estados y 042 Particulares).</li>
                            <li>Traspaso formal de expedientes a Facturación mediante remito digital firmado.</li>
                            <li>Facturación en SALUS y marcación automática/manual de fichas facturadas o devueltas.</li>
                        </ol>
                    </div>

                    <div>
                        <h3 style={{ fontSize: '13px', fontWeight: 'bold', margin: '0 0 6px 0' }}>5. PROCEDIMIENTOS OPERATIVOS POR MÓDULO:</h3>
                        <div style={{ paddingLeft: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <div>
                                <strong style={{ color: '#1E5799' }}>5.1 Panel de Cirugías y Triage Quirúrgico:</strong>
                                <p style={{ margin: '2px 0 0 0', color: '#374151' }}>
                                    Control del pipeline quirúrgico por WhatsApp (Lila: sin contactar, Amarillo: en revisión, Verde: autorizada, Azul: confirmada). Módulo de Triage para carga y análisis automático de fojas quirúrgicas.
                                </p>
                            </div>
                            <div>
                                <strong style={{ color: '#1E5799' }}>5.2 Cola de Turnos y Boxes:</strong>
                                <p style={{ margin: '2px 0 0 0', color: '#374151' }}>
                                    Tótem de autoservicio para pacientes, llamador audiovisual con voz institucional y campana, y gestión de boxes para recepcionistas.
                                </p>
                            </div>
                            <div>
                                <strong style={{ color: '#1E5799' }}>5.3 Control de Altas Administrativas:</strong>
                                <p style={{ margin: '2px 0 0 0', color: '#374151' }}>
                                    Paginación de 10 filas por defecto, mapeo automático a Particular para 042 / nombres de pacientes, Carrito de Traspaso a Facturación con constancia y panel de Métricas BI.
                                </p>
                            </div>
                            <div>
                                <strong style={{ color: '#1E5799' }}>5.4 Facturación Internado y Devoluciones:</strong>
                                <p style={{ margin: '2px 0 0 0', color: '#374151' }}>
                                    Recepción de expedientes transferidos para liquidación, detección automática de facturas de SALUS (PDV 21/31) y remitos de devolución con motivo.
                                </p>
                            </div>
                            <div>
                                <strong style={{ color: '#1E5799' }}>5.5 Asistente Beto IA:</strong>
                                <p style={{ margin: '2px 0 0 0', color: '#374151' }}>
                                    Asistente exclusivo de ADM-QUI accesible mediante botón o atajo <code>Ctrl + K</code> para responder preguntas de datos, emitir reportes PDF y exportar a Excel.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── PIE DE DOCUMENTO CON TABLA DE FIRMAS ── */}
                <table style={{ width: '100%', borderCollapse: 'collapse', border: '1.5px solid #000', marginTop: '30px', fontSize: '11px', height: '110px' }}>
                    <tbody>
                        {/* Fila de Títulos */}
                        <tr style={{ background: '#E5E7EB', height: '24px' }}>
                            <th style={{ border: '1px solid #000', width: '33.33%', padding: '4px 8px', textAlign: 'left', fontWeight: 'bold' }}>
                                ELABORADO:
                            </th>
                            <th style={{ border: '1px solid #000', width: '33.33%', padding: '4px 8px', textAlign: 'left', fontWeight: 'bold' }}>
                                REVISADO:
                            </th>
                            <th style={{ border: '1px solid #000', width: '33.33%', padding: '4px 8px', textAlign: 'left', fontWeight: 'bold' }}>
                                APROBADO:
                            </th>
                        </tr>
                        {/* Fila de Firmas y Cargos */}
                        <tr>
                            <td style={{ border: '1px solid #000', padding: '12px 8px 8px', textAlign: 'center', verticalAlign: 'bottom' }}>
                                <div style={{ fontWeight: 'bold', fontSize: '12px' }}>{DOC_META.elaboro}</div>
                                <div style={{ fontSize: '10px', color: '#4B5563', marginTop: '2px' }}>{DOC_META.elaboroCargo}</div>
                            </td>
                            <td style={{ border: '1px solid #000', padding: '12px 8px 8px', textAlign: 'center', verticalAlign: 'bottom' }}>
                                <div style={{ fontWeight: 'bold', fontSize: '12px' }}>{DOC_META.reviso}</div>
                                <div style={{ fontSize: '10px', color: '#4B5563', marginTop: '2px' }}>{DOC_META.revisoCargo}</div>
                            </td>
                            <td style={{ border: '1px solid #000', padding: '12px 8px 8px', textAlign: 'center', verticalAlign: 'bottom' }}>
                                <div style={{ fontWeight: 'bold', fontSize: '12px' }}>{DOC_META.aprobo}</div>
                                <div style={{ fontSize: '10px', color: '#4B5563', marginTop: '2px' }}>{DOC_META.aproboCargo}</div>
                            </td>
                        </tr>
                    </tbody>
                </table>
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
