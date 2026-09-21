import fs from 'fs';
import path from 'path';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// Colores institucionales estándar Asociaciones — Sanatorio Argentino
const COLORS = {
    navyHeader: [13, 59, 102],     // #0D3B66
    accentBlue: [59, 130, 246],    // #3B82F6
    darkText: [30, 41, 59],        // #1E293B
    subtitleText: [180, 200, 220], // #B4C8DC
    mutedText: [100, 116, 139],    // #64748B
    lightGray: [241, 245, 249],    // #F1F5F9
    borderColor: [226, 232, 240],  // #E2E8F0
    white: [255, 255, 255],
    green: [16, 185, 129],         // #10B981
    amber: [245, 158, 11],         // #F59E0B
    tagFeat: [2, 132, 199],        // #0284C7
    tagFix: [220, 38, 38],         // #DC2626
    tagRefactor: [147, 51, 234],   // #9333EA
};

async function generateReportPdf() {
    console.log('Iniciando generación de PDF institucional con estética de Asociaciones...');
    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
    });

    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 14;
    const colW = pageW - margin * 2;

    // 1. Cargar fuentes Montserrat
    let fontName = 'helvetica';
    try {
        console.log('Descargando fuentes Montserrat (Regular y Bold)...');
        const [regRes, boldRes] = await Promise.all([
            fetch('https://cdn.jsdelivr.net/fontsource/fonts/montserrat@latest/latin-400-normal.ttf'),
            fetch('https://cdn.jsdelivr.net/fontsource/fonts/montserrat@latest/latin-700-normal.ttf')
        ]);
        if (regRes.ok && boldRes.ok) {
            const [regBuf, boldBuf] = await Promise.all([regRes.arrayBuffer(), boldRes.arrayBuffer()]);
            doc.addFileToVFS('Montserrat-Regular.ttf', Buffer.from(regBuf).toString('base64'));
            doc.addFont('Montserrat-Regular.ttf', 'Montserrat', 'normal');
            doc.addFileToVFS('Montserrat-Bold.ttf', Buffer.from(boldBuf).toString('base64'));
            doc.addFont('Montserrat-Bold.ttf', 'Montserrat', 'bold');
            fontName = 'Montserrat';
            console.log('✓ Fuentes Montserrat registradas con éxito.');
        }
    } catch (err) {
        console.warn('Fallback a Helvetica:', err.message);
    }

    // 2. Cargar logo de Sanatorio Argentino
    let logoBase64 = null;
    try {
        if (fs.existsSync('public/logosanatorio.png')) {
            const imgData = fs.readFileSync('public/logosanatorio.png');
            logoBase64 = `data:image/png;base64,${imgData.toString('base64')}`;
        }
    } catch (e) {
        console.warn('No se pudo leer logosanatorio.png:', e.message);
    }

    // ═══════════════════════════════════════════════════════════════════
    // HEADER OFICIAL (Estética Asociaciones)
    // ═══════════════════════════════════════════════════════════════════
    function drawHeader() {
        // Franja superior azul marino
        doc.setFillColor(...COLORS.navyHeader);
        doc.rect(0, 0, pageW, 34, 'F');

        // Logo institucional circular sobre base blanca
        const logoX = margin + 1;
        const logoY = 9;
        const logoSize = 15;
        doc.setFillColor(...COLORS.white);
        doc.circle(logoX + logoSize / 2, logoY + logoSize / 2, logoSize / 2 + 1.2, 'F');

        if (logoBase64) {
            doc.addImage(logoBase64, 'PNG', logoX, logoY, logoSize, logoSize);
        } else {
            doc.setFontSize(8);
            doc.setFont(fontName, 'bold');
            doc.setTextColor(...COLORS.navyHeader);
            doc.text('SA', logoX + 4, logoY + logoSize / 2 + 2);
        }

        // Títulos de cabecera
        doc.setFontSize(15);
        doc.setFont(fontName, 'bold');
        doc.setTextColor(...COLORS.white);
        doc.text('SANATORIO ARGENTINO', margin + 19, 15);

        doc.setFontSize(8.5);
        doc.setFont(fontName, 'normal');
        doc.setTextColor(...COLORS.subtitleText);
        doc.text('Innovación y Transformación Digital · Dirección Operativa', margin + 19, 22);

        // Badge superior derecho
        doc.setFontSize(11);
        doc.setFont(fontName, 'bold');
        doc.setTextColor(...COLORS.white);
        doc.text('INFORME DE TRABAJO', pageW - margin, 15, { align: 'right' });

        doc.setFontSize(8);
        doc.setFont(fontName, 'normal');
        doc.setTextColor(...COLORS.subtitleText);
        doc.text('Jornada Oficial · 21/09/2026', pageW - margin, 22, { align: 'right' });

        // Línea de acento azul (#3B82F6)
        doc.setFillColor(...COLORS.accentBlue);
        doc.rect(0, 34, pageW, 2, 'F');
    }

    // ═══════════════════════════════════════════════════════════════════
    // FOOTER NUMERADO EN CADA PÁGINA
    // ═══════════════════════════════════════════════════════════════════
    function addFooters() {
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setDrawColor(...COLORS.borderColor);
            doc.setLineWidth(0.3);
            doc.line(margin, pageH - 12, pageW - margin, pageH - 12);

            doc.setFontSize(7);
            doc.setFont(fontName, 'normal');
            doc.setTextColor(...COLORS.mutedText);
            doc.text('Sanatorio Argentino SRL · Plataforma Sanatorio Argentino · Documento Oficial de Auditoría de Trabajo', margin, pageH - 7);
            doc.text(`Página ${i} de ${pageCount}`, pageW - margin, pageH - 7, { align: 'right' });
        }
    }

    drawHeader();

    let y = 44;

    // ═══════════════════════════════════════════════════════════════════
    // INFO BAR METADATOS CLÍNICOS Y DE GESTIÓN (Estilo Asociaciones)
    // ═══════════════════════════════════════════════════════════════════
    doc.setFillColor(...COLORS.lightGray);
    doc.roundedRect(margin, y, colW, 19, 3, 3, 'F');
    doc.setDrawColor(...COLORS.borderColor);
    doc.roundedRect(margin, y, colW, 19, 3, 3, 'S');

    const infoItems = [
        { label: 'PROFESIONAL / AUTOR', value: 'Lic. Lucas Marinero' },
        { label: 'FECHA DE GESTIÓN', value: '21 de Septiembre de 2026' },
        { label: 'ALCANCE / SISTEMA', value: 'Plataforma & Contact Center' },
        { label: 'HITOS DESPLEGADOS', value: '46 Commits / Tareas' },
    ];

    const cellW = colW / 4;
    infoItems.forEach((item, i) => {
        const x = margin + cellW * i + 5;
        doc.setFontSize(6.2);
        doc.setFont(fontName, 'normal');
        doc.setTextColor(...COLORS.mutedText);
        doc.text(item.label, x, y + 6);

        doc.setFontSize(i === 0 || i === 3 ? 9.5 : 8.5);
        doc.setFont(fontName, 'bold');
        doc.setTextColor(...COLORS.navyHeader);
        doc.text(item.value, x, y + 13.5);
    });

    y += 27;

    // ═══════════════════════════════════════════════════════════════════
    // SECCIÓN 1: RESUMEN EJECUTIVO Y OBJETIVOS CUMPLIDOS
    // ═══════════════════════════════════════════════════════════════════
    doc.setFillColor(...COLORS.accentBlue);
    doc.rect(margin, y, 3, 7, 'F');
    doc.setFontSize(10.5);
    doc.setFont(fontName, 'bold');
    doc.setTextColor(...COLORS.navyHeader);
    doc.text('RESUMEN EJECUTIVO DE LA JORNADA', margin + 6, y + 5.5);
    y += 12;

    const summaryText = 
        "El presente documento consolida la jornada técnica y operativa del día 21/09/2026 a cargo de Lic. Lucas Marinero en el marco del desarrollo de la Plataforma Sanatorio Argentino y el Contact Center Omnicanal.\n" +
        "Se ejecutó una reingeniería integral orientada a la homologación funcional con el sistema AsisteClick, integrando conexión directa con el padrón hospitalario SALUS (SQL Server), auditoría de órdenes médicas con Inteligencia Artificial (GPT-4o Vision), y la ingestión oficial de 93 respuestas rápidas institucionales con variables dinámicas. Todos los módulos fueron probados y compilados exitosamente.";

    doc.setFontSize(8.2);
    doc.setFont(fontName, 'normal');
    doc.setTextColor(...COLORS.darkText);
    const splitSummary = doc.splitTextToSize(summaryText, colW);
    doc.text(splitSummary, margin, y);
    y += splitSummary.length * 4.5 + 4;

    // Tarjetas de Highlights / Logros Clave
    const cards = [
        { title: '93 Respuestas Rápidas', desc: 'Plantillas oficiales de AsisteClick sincronizadas en Supabase con atajos slash (/)' },
        { title: 'Integración Live SALUS', desc: 'Detección de grupo familiar y priorización automática de adultos sobre menores' },
        { title: 'Visor Multiformato', desc: 'Soporte universal para PDFs, Word (.docx), Excel (.xlsx) e imágenes médicas' },
        { title: 'Chatbot con Memoria IA', desc: 'Auditoría de fotos de pedidos médicos y orientación para Chequeos Preventivos' }
    ];

    const cardW = (colW - 9) / 4;
    cards.forEach((card, idx) => {
        const cx = margin + idx * (cardW + 3);
        doc.setFillColor(...COLORS.lightGray);
        doc.roundedRect(cx, y, cardW, 17, 2, 2, 'F');
        doc.setDrawColor(...COLORS.borderColor);
        doc.roundedRect(cx, y, cardW, 17, 2, 2, 'S');

        doc.setFontSize(7.5);
        doc.setFont(fontName, 'bold');
        doc.setTextColor(...COLORS.navyHeader);
        doc.text(card.title, cx + 3, y + 5.5);

        doc.setFontSize(5.8);
        doc.setFont(fontName, 'normal');
        doc.setTextColor(...COLORS.mutedText);
        const splitCard = doc.splitTextToSize(card.desc, cardW - 6);
        doc.text(splitCard, cx + 3, y + 9.5);
    });

    y += 24;

    // ═══════════════════════════════════════════════════════════════════
    // SECCIÓN 2: CRONOGRAMA HORARIO DE ACTIVIDADES Y COMMITS (TABLA)
    // ═══════════════════════════════════════════════════════════════════
    doc.setFillColor(...COLORS.accentBlue);
    doc.rect(margin, y, 3, 7, 'F');
    doc.setFontSize(10.5);
    doc.setFont(fontName, 'bold');
    doc.setTextColor(...COLORS.navyHeader);
    doc.text('CRONOGRAMA DETALLADO DE TAREAS Y COMMITS (21/09/2026)', margin + 6, y + 5.5);
    y += 10;

    const commitRows = [
        ['09:58:54', '9a17e1b', 'FEAT', 'RBAC & Seguridad', 'Control de acceso estricto por usuario y conteo de chats asignados por agente.'],
        ['10:19:38', '622bf48', 'FEAT', 'Visión IA', 'Edge function para análisis clínico de pedidos médicos enviados por imagen.'],
        ['10:29:18', 'ee0501b', 'FEAT', 'Resumen IA', 'Detección automática de motivo de consulta y matching con prestadores SALUS.'],
        ['10:40:24', 'e00f795', 'FEAT', 'Ficha 360°', 'Normalización multi-prefijo telefónico argentino y consultas previas de SALUS.'],
        ['10:49:08', '1556e45', 'FEAT', 'Atajos (/ )', 'Motor de búsqueda rápida de plantillas O(1) con navegación por teclado.'],
        ['11:01:23', '3cc2353', 'FIX', 'Realtime Hub', 'Suscripción en tiempo real con heartbeat para evitar caídas de sockets.'],
        ['11:04:48', 'd02533d', 'FIX', 'Contexto IA', 'Alineación de historial de mensajes para evitar alucinaciones en resúmenes.'],
        ['11:32:00', '78c7faf', 'FEAT', 'Historial SALUS', 'Integración de síntomas, evolución médica y turnos próximos presenciales y online.'],
        ['11:35:47', '50e1638', 'FEAT', 'Modal Reinicio', 'Modal institucional de confirmación para reinicio del flujo del chatbot.'],
        ['11:40:57', 'af174a3', 'FEAT', 'Avisos de Espera', 'Aviso oficial de demora estimada (30m a 1h) y horarios de atención humana.'],
        ['11:42:51', '2d41711', 'FIX', 'Identidad Agentes', 'Alineación de nombres institucionales de Sofia Olivieri y Virginia Jacques.'],
        ['11:53:59', '939aa03', 'FIX', 'Pestaña Historial', 'Optimización de renderizado y sincronización en Supabase para antecedentes.'],
        ['11:58:20', 'c16536a', 'FEAT', 'Sync Server', 'Carga automática de diagnósticos, turnos web y parámetros de prestadores.'],
        ['12:17:40', '0e5e5c9', 'FEAT', 'Encuesta de Calidad', 'Mapeo por DNI y despacho de encuesta de satisfacción (5 estrellas) al finalizar.'],
        ['12:27:36', 'd43a085', 'FIX', 'Ortografía', 'Corrección ortográfica oficial en mensaje de despedida del Contact Center.'],
        ['12:35:49', '187cdaf', 'FEAT', 'Chats Finalizados', 'Consolidación de filtros archivados/cerrados/finalizados sin rebote visual.'],
        ['12:45:37', '9c14319', 'FIX', 'Chequeo Preventivo', 'Flujo multidisciplinario en chatbot impidiendo asignación errónea de médico particular.'],
        ['12:56:23', 'a53c0c0', 'FEAT', 'Programa Prevenir', 'Respuestas parametrizadas y derivación para planes de prevención OSP.'],
        ['13:39:54', '5edeaf9', 'FEAT', 'Guardias 24hs', 'Orientación de sedes ginecológicas y pediátricas con pausa horaria del bot.'],
        ['13:52:57', '90508d6', 'FIX', 'Gobernanza UCI', 'Visibilidad y scroll mejorado para destete (weaning) y extubación.'],
        ['14:10:10', '8302333', 'FIX', 'Reactivación Bot', 'Reinicio a cero del bot si el paciente vuelve a escribir tras el cierre.'],
        ['14:30:24', 'bfeb8d0', 'FEAT', 'Turnos Online', 'Detección proactiva de reservas futuras del paciente por número de DNI.'],
        ['14:36:23', '748f7b7', 'OPT', 'Textos Chatbot', 'Síntesis y reducción de longitud de respuestas para lectura ágil en WhatsApp.'],
        ['14:42:15', '4e99213', 'FIX', 'Saludo Paciente', 'Saludo personalizado con nombre de pila sin exponer agentes en bienvenida.'],
        ['15:03:36', '748402a', 'FEAT', 'Memoria de Handoff', 'Preservación de datos capturados para la atención de operadoras humanas.'],
        ['15:11:57', '8c7f366', 'REF', 'Cabecera de Chat', 'Reubicación de controles del bot y badge de padrón para ganar ergonomía visual.'],
        ['15:16:20', '7508656', 'FIX', 'Inmutabilidad SALUS', 'Bloqueo de edición manual de filiatorios para preservar trazabilidad médica.'],
        ['15:17:29', '347182b', 'FIX', 'Depuración UI', 'Eliminación de widget redundante de turnos próximos en panel lateral.'],
        ['15:25:10', '7662e5d', 'FEAT', 'Consola Resizable', 'Sidebar unificado con agentes y panel lateral resizable (260px - 550px).'],
        ['15:34:14', '8eb9464', 'FEAT', 'Datos Filiatorios', 'Sincronización de fecha de nacimiento y correo desde SALUS y Turnos Web.'],
        ['15:39:34', 'a27057b', 'FEAT', 'Grupos Familiares', 'Conmutador rápido entre familiares que comparten el mismo teléfono.'],
        ['15:44:20', '097571b', 'FIX', 'Nombres Reales', 'Erradicación de "Bot Sanatorio" de la bandeja de entrada para ver pacientes reales.'],
        ['15:45:54', '6807065', 'REF', 'Limpieza Panel', 'Remoción de componentes de asignación duplicados en barra lateral.'],
        ['15:49:06', '1f41b84', 'FEAT', 'Disparo IA Reactivo', 'Análisis inmediato de mensajes entrantes con debounce de 1.2 segundos.'],
        ['15:57:48', '4250e8f', 'FIX', 'Handoff Silencioso', 'Supresión de mensajes dobles de bienvenida al tomar la conversación la agente.'],
        ['16:05:14', 'c55e764', 'FEAT', 'Fotos sin Texto', 'Pregunta proactiva si el paciente requiere turno o autorización ante imágenes aisladas.'],
        ['16:10:53', 'd012314', 'FEAT', 'Visor Médico', 'Zoom (50%-400%), rotación (360°) y descarga directa por blob con teclado.'],
        ['16:24:41', 'c483856', 'FEAT', 'Módulos Anidados', 'Navegación fluida entre Consola, Métricas, Mi Semana y Turnos Online.'],
        ['16:30:54', 'f141acf', 'FEAT', 'Dashboard Métricas', 'Estadísticas de mensajes por agente vs bot, motivos de cierre y motivos de consulta.'],
        ['16:44:27', 'f29c129', 'FEAT', 'Indicadores SLA', 'Cálculo y despliegue del tiempo de espera sin responder para control de calidad.'],
        ['16:46:15', '519fec8', 'FIX', 'Alineación Visual', 'Retiro de insignias sobrecargadas en la tarjeta del paciente.'],
        ['16:52:25', '07acb78', 'FEAT', 'Gestión Terceros', 'Asociación de atención médica a nombre de otro DNI sin alterar el WhatsApp emisor.'],
        ['17:01:10', 'e5cec2e', 'FIX', 'Edge Functions', 'Corrección de variables duplicadas en webhook BuilderBot y errores HTTP 406.'],
        ['17:09:49', 'd3cfffb', 'FEAT', 'Visor Multiformato', 'Soporte universal para PDFs, Word (.docx), Excel (.xlsx) e imágenes médicas.'],
        ['18:16:44', '8a45502', 'FEAT', 'Respuestas Rápidas', 'Carga de 93 plantillas AsisteClick, Live SALUS familiares y Plataforma Sanatorio Argentino.'],
        ['18:17:09', 'ebd1034', 'DOCS', 'Informe de Trabajo', 'Actualización de trazabilidad y cronograma oficial de la jornada.']
    ];

    autoTable(doc, {
        startY: y,
        head: [['HORA', 'COMMIT', 'TIPO', 'MÓDULO / ALCANCE', 'DESCRIPCIÓN DE LA TAREA REALIZADA']],
        body: commitRows,
        margin: { left: margin, right: margin },
        theme: 'plain',
        styles: {
            font: fontName,
            fontSize: 7.2,
            cellPadding: 2.2,
            lineColor: COLORS.borderColor,
            lineWidth: 0.15,
            textColor: COLORS.darkText,
            valign: 'middle'
        },
        headStyles: {
            fillColor: COLORS.navyHeader,
            textColor: COLORS.white,
            fontStyle: 'bold',
            fontSize: 7.5,
            halign: 'left'
        },
        alternateRowStyles: {
            fillColor: [248, 250, 252]
        },
        columnStyles: {
            0: { cellWidth: 17, halign: 'center', fontStyle: 'bold', textColor: COLORS.navyHeader },
            1: { cellWidth: 16, halign: 'center', textColor: COLORS.mutedText },
            2: { cellWidth: 14, halign: 'center', fontStyle: 'bold' },
            3: { cellWidth: 32, fontStyle: 'bold', textColor: COLORS.navyHeader },
            4: { cellWidth: 'auto' }
        },
        didParseCell: function(data) {
            if (data.section === 'body' && data.column.index === 2) {
                const val = data.cell.raw;
                if (val === 'FEAT') data.cell.styles.textColor = COLORS.tagFeat;
                else if (val === 'FIX') data.cell.styles.textColor = COLORS.tagFix;
                else if (val === 'REF') data.cell.styles.textColor = COLORS.tagRefactor;
                else if (val === 'OPT') data.cell.styles.textColor = COLORS.amber;
            }
        }
    });

    y = doc.lastAutoTable.finalY + 12;

    // Verificar si queda espacio para el bloque de firmas y conclusiones en la última página
    if (y > pageH - 55) {
        doc.addPage();
        drawHeader();
        y = 44;
    }

    // ═══════════════════════════════════════════════════════════════════
    // SECCIÓN 3: CONCLUSIÓN Y RESULTADOS OPERATIVOS
    // ═══════════════════════════════════════════════════════════════════
    doc.setFillColor(...COLORS.accentBlue);
    doc.rect(margin, y, 3, 7, 'F');
    doc.setFontSize(10.5);
    doc.setFont(fontName, 'bold');
    doc.setTextColor(...COLORS.navyHeader);
    doc.text('ESTADO DE HOMOLOGACIÓN Y CIERRE DE JORNADA', margin + 6, y + 5.5);
    y += 11;

    const conclusionText = 
        "• Validación Técnica: Se ejecutó npm run build finalizando con código de salida 0 (sin advertencias críticas de Rollup ni fallos de dependencias).\n" +
        "• Conectividad SALUS: El servicio sync-server se encuentra operando en el puerto 3456 con conexión estable a 128.223.16.29:2450.\n" +
        "• Catálogo Oficial: Las 93 respuestas rápidas de AsisteClick se encuentran persistidas en la tabla contact_center_quick_replies con variables funcionales.\n" +
        "• Experiencia de Usuario: Se regularizó el orden cronológico del chat y se corrigió el scroll para asegurar la visualización inmediata de los mensajes.";

    doc.setFontSize(7.8);
    doc.setFont(fontName, 'normal');
    doc.setTextColor(...COLORS.darkText);
    const splitConclusion = doc.splitTextToSize(conclusionText, colW);
    doc.text(splitConclusion, margin, y);
    y += splitConclusion.length * 4.4 + 14;

    // ═══════════════════════════════════════════════════════════════════
    // SECCIÓN 4: BLOQUE OFICIAL DE FIRMAS (Estilo Asociaciones)
    // ═══════════════════════════════════════════════════════════════════
    const sigBoxW = 75;
    const sig1X = margin + 15;
    const sig2X = pageW - margin - sigBoxW - 15;

    doc.setDrawColor(...COLORS.borderColor);
    doc.setLineWidth(0.4);
    doc.line(sig1X, y + 16, sig1X + sigBoxW, y + 16);
    doc.line(sig2X, y + 16, sig2X + sigBoxW, y + 16);

    doc.setFontSize(8.5);
    doc.setFont(fontName, 'bold');
    doc.setTextColor(...COLORS.navyHeader);
    doc.text('Lic. Lucas Marinero', sig1X + sigBoxW / 2, y + 21, { align: 'center' });
    doc.text('Dirección Operativa / Médica', sig2X + sigBoxW / 2, y + 21, { align: 'center' });

    doc.setFontSize(7);
    doc.setFont(fontName, 'normal');
    doc.setTextColor(...COLORS.mutedText);
    doc.text('Innovación y Transformación Digital', sig1X + sigBoxW / 2, y + 25.5, { align: 'center' });
    doc.text('Sanatorio Argentino SRL', sig2X + sigBoxW / 2, y + 25.5, { align: 'center' });

    // Agregar pie de página a todas las hojas creadas
    addFooters();

    // Guardar archivo en disco
    const outputPath = path.resolve('INFORME_TRABAJO_2026_09_21_LUCAS_MARINERO.pdf');
    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
    fs.writeFileSync(outputPath, pdfBuffer);

    console.log(`✓ Archivo PDF generado exitosamente: ${outputPath} (${pdfBuffer.length} bytes)`);
}

generateReportPdf().catch(err => {
    console.error('Error generando PDF:', err);
    process.exit(1);
});
