/**
 * gobernanzaPropuestaTrabajoPdf.js
 * Propuesta Sugerida de Metodología y Flujo de Trabajo Colaborativo
 * para completar los 29 Sectores del Proyecto de Gobernanza de Datos — Sanatorio Argentino.
 *
 * Equipo de Trabajo:
 * - Pamela (Jefa de Tecnología y Sistemas - TyS): Gestión Institucional, Coordinación y Entrevistas Sectoriales.
 * - Matías (Analista de Datos): Ingeniería de Datos, Consultas SQL sobre SALUS, Limpieza y Fichas de Indicadores.
 * - Lucas (Desarrollo Front-End): Interfaz de Usuario (UI/UX), Tableros Interactivos y Exportación Documental.
 */
import jsPDF from 'jspdf';
import autoTableModule from 'jspdf-autotable';
import { installSafePdfText, sanitizePdfText } from './gobernanzaServiceProjectPdf.js';

const JsPDFConstructor = jsPDF.jsPDF || jsPDF;
const autoTable = autoTableModule.default || autoTableModule;

const COLORS = {
    navy: [13, 59, 102],          // #0D3B66 Azul Institucional Sanatorio Argentino
    accentBlue: [37, 99, 235],    // #2563EB Azul Real
    skyBlue: [59, 130, 246],      // #3B82F6 Línea de acento
    softBlueBg: [239, 246, 255],  // #EFF6FF
    softGreenBg: [240, 253, 244], // #F0FDF4
    softAmberBg: [255, 251, 235], // #FFFBEB
    slateDark: [15, 23, 42],      // #0F172A
    slateText: [51, 65, 85],      // #334155
    slateMuted: [100, 116, 139],  // #64748B
    lightBg: [248, 250, 252],     // #F8FAFC
    border: [203, 213, 225],      // #CBD5E1
    emerald: [5, 150, 105],       // #059669
    amber: [217, 119, 6],         // #D97706
    white: [255, 255, 255]
};

async function loadCircularLogo(overrideDataUrl = null) {
    if (overrideDataUrl) return overrideDataUrl;
    if (typeof window === 'undefined') return null;
    try {
        const response = await fetch('/logo_sanatorio.png');
        const blob = await response.blob();
        return await new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const size = 240;
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#FFFFFF';
                ctx.beginPath();
                ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
                ctx.fill();
                const pad = 16;
                ctx.drawImage(img, pad, pad, size - pad * 2, size - pad * 2);
                resolve(canvas.toDataURL('image/png'));
            };
            img.onerror = () => resolve(null);
            img.src = URL.createObjectURL(blob);
        });
    } catch {
        return null;
    }
}

function drawInstitutionalHeader(doc, pageWidth, margin, logoBase64, badgeTitle, badgeSubtitle) {
    doc.setFillColor(...COLORS.navy);
    doc.rect(0, 0, pageWidth, 33, 'F');
    doc.setFillColor(...COLORS.skyBlue);
    doc.rect(0, 33, pageWidth, 2, 'F');

    let textStartX = margin;
    if (logoBase64) {
        try {
            doc.addImage(logoBase64, 'PNG', margin, 4.5, 23, 23);
            textStartX = margin + 27;
        } catch {
            textStartX = margin;
        }
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14.5);
    doc.setTextColor(...COLORS.white);
    doc.text('SANATORIO ARGENTINO', textStartX, 13.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(147, 197, 253);
    doc.text('Innovacion y Transformacion Digital', textStartX, 19.8);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.4);
    doc.setTextColor(219, 234, 254);
    doc.text('Proyecto de Gobernanza de Datos Clinicos y Operativos (29 Sectores)', textStartX, 25.8);

    const badgeW = 76;
    const badgeX = pageWidth - margin - badgeW;
    doc.setFillColor(23, 78, 130);
    doc.roundedRect(badgeX, 5.5, badgeW, 21, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.8);
    doc.setTextColor(...COLORS.white);
    doc.text(badgeTitle, badgeX + badgeW / 2, 12.8, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.6);
    doc.setTextColor(191, 219, 254);
    doc.text(badgeSubtitle, badgeX + badgeW / 2, 19.5, { align: 'center' });
}

function drawSectionBanner(doc, y, margin, contentWidth, num, title, subtitle) {
    doc.setFillColor(...COLORS.softBlueBg);
    doc.setDrawColor(...COLORS.border);
    doc.setLineWidth(0.3);
    doc.roundedRect(margin, y, contentWidth, 12.5, 1.8, 1.8, 'FD');

    doc.setFillColor(...COLORS.navy);
    doc.roundedRect(margin, y, 4.2, 12.5, 1.2, 1.2, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.1);
    doc.setTextColor(...COLORS.navy);
    doc.text(`${num}. ${title}`, margin + 7.5, y + 5.2);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.0);
    doc.setTextColor(...COLORS.slateMuted);
    doc.text(subtitle, margin + 7.5, y + 9.9);

    return y + 15.5;
}

export function buildGobernanzaPropuestaTrabajoPdfDoc(logoBase64 = null) {
    const doc = new JsPDFConstructor({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    installSafePdfText(doc);

    const originalAutoTable = autoTable;
    const safeAutoTable = (d, opts) => {
        if (opts.head) {
            opts.head = opts.head.map(row => row.map(cell => typeof cell === 'string' ? sanitizePdfText(cell) : cell));
        }
        if (opts.body) {
            opts.body = opts.body.map(row => row.map(cell => typeof cell === 'string' ? sanitizePdfText(cell) : cell));
        }
        return originalAutoTable(d, opts);
    };

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 13;
    const contentWidth = pageWidth - margin * 2;

    // ─── PÁGINA 1: PROPÓSITO, PUNTO DE PARTIDA Y SUGERENCIA DE ARTICULACIÓN DE ROLES ───
    drawInstitutionalHeader(
        doc,
        pageWidth,
        margin,
        logoBase64,
        'PROPUESTA METODOLOGICA',
        'Sugerencia de Flujo de Trabajo | 29 Sectores'
    );

    let y = 40;

    // Caja de Título y Espíritu de Sugerencia
    doc.setFillColor(...COLORS.lightBg);
    doc.setDrawColor(...COLORS.border);
    doc.setLineWidth(0.35);
    doc.roundedRect(margin, y, contentWidth, 27, 2.2, 2.2, 'FD');
    doc.setFillColor(...COLORS.navy);
    doc.roundedRect(margin, y, 4.5, 27, 1.5, 1.5, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.3);
    doc.setTextColor(...COLORS.accentBlue);
    doc.text('DOCUMENTO INTERNO DE TRABAJO  |  SUGERENCIA DE ORGANIZACION OPERATIVA EN EQUIPO', margin + 8, y + 5.3);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.2);
    doc.setTextColor(...COLORS.slateDark);
    doc.text('Propuesta de Metodologia y Flujo Colaborativo para Completar los 29 Sectores de Gobernanza', margin + 8, y + 11.2);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.3);
    doc.setTextColor(...COLORS.slateText);
    const introParagraph = 'Este documento plantea una sugerencia practica de trabajo para articular las tareas entre Pamela (Jefa de Tecnologia y Sistemas - TyS, a cargo de la gestion y entrevistas con los sectores), Matias (Analista de Datos, a cargo del modelado SQL y limpieza en SALUS) y Lucas (Desarrollo Front-End, a cargo de la construccion visual de los tableros e informes). El objetivo es aprovechar al 100% la infraestructura que ya tenemos montada para avanzar de forma fluida y ordenada hasta cubrir los 29 sectores.';
    const introLines = doc.splitTextToSize(introParagraph, contentWidth - 12);
    doc.text(introLines, margin + 8, y + 16.2);

    y += 31;

    // 4 Tarjetas Resumen del Esquema Sugerido
    const kpiCards = [
        {
            label: 'ALCANCE TOTAL DEL PROYECTO',
            val: '29 Sectores',
            sub: '6 bloques troncales ya montados en plataforma + 23 sectores a relevar en oleadas',
            color: COLORS.navy
        },
        {
            label: 'PUNTO DE PARTIDA ACTUAL',
            val: '100% Montado',
            sub: 'Puente SALUS, base de datos, Grabador IA de entrevistas y plantillas UI operativas',
            color: COLORS.emerald
        },
        {
            label: 'EQUIPO DE TRABAJO (3 ROLES)',
            val: 'TyS + Datos + UI',
            sub: 'Pamela (Entrevistas/TyS) · Matias (Datos/SQL) · Lucas (Front-End)',
            color: COLORS.accentBlue
        },
        {
            label: 'RITMO SUGERIDO DE AVANCE',
            val: '3 a 4 / semana',
            sub: 'Esquema escalonado para completar los sectores restantes en 6 a 8 semanas',
            color: COLORS.amber
        }
    ];

    const cardGap = 3.2;
    const cardW = (contentWidth - cardGap * 3) / 4;
    const cardH = 21;

    kpiCards.forEach((c, idx) => {
        const cx = margin + idx * (cardW + cardGap);
        doc.setFillColor(...COLORS.white);
        doc.setDrawColor(...COLORS.border);
        doc.setLineWidth(0.3);
        doc.roundedRect(cx, y, cardW, cardH, 1.8, 1.8, 'FD');

        doc.setFillColor(...c.color);
        doc.roundedRect(cx, y, cardW, 2.3, 1, 1, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.1);
        doc.setTextColor(...COLORS.slateMuted);
        doc.text(c.label, cx + 2.8, y + 6.4);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10.8);
        doc.setTextColor(...c.color);
        doc.text(c.val, cx + 2.8, y + 12.6);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(5.9);
        doc.setTextColor(...COLORS.slateText);
        const subLines = doc.splitTextToSize(c.sub, cardW - 5.2);
        doc.text(subLines, cx + 2.8, y + 16.5);
    });

    y += cardH + 3.8;

    // SECCIÓN 1: ROLES Y COMPLEMENTARIEDAD DEL EQUIPO
    y = drawSectionBanner(
        doc,
        y,
        margin,
        contentWidth,
        '1',
        'SUGERENCIA DE DIVISION DE ROLES Y ENTREGABLES COMPLEMENTARIOS',
        'Cada integrante aporta su especialidad sin superponerse, generando un insumo claro para el siguiente paso'
    );

    const rolesRows = [
        [
            'Pamela\n(Jefa de TyS)',
            'Gestion de Entrevistas,\nCoordinacion y Validacion',
            '• Coordina la agenda institucional y lidera las entrevistas con los referentes de los 29 sectores.\n• Utiliza el Grabador IA de la plataforma para registrar la reunion, transcribir y extraer dolores/necesidades.\n• Define junto al referente del sector cuales son los 3 a 6 indicadores clave (KPIs) que necesitan medir.\n• Una vez listo el tablero, coordina la muestra final con el referente para dar el visto bueno del sector.',
            'Proyecto del sector creado en la plataforma con audio/minuta de entrevista y listado de requerimientos e indicadores solicitados.'
        ],
        [
            'Matias\n(Analista de Datos)',
            'Ingenieria de Datos,\nConsultas SQL y Reglas KPI',
            '• Toma los requerimientos e indicadores relevados por Pamela en las entrevistas de cada sector.\n• Explora las tablas de SALUS SQL Server (VLISE_*, TABLEAU_*, SER_*) para ubicar el dato exacto.\n• Detecta duplicados o casos especiales (ej. contrastes en TC, reingresos en el dia, filtros de camas) y aplica las reglas de limpieza.\n• Documenta la Ficha Metodologica del indicador (formula, fuente, frecuencia) y deja lista la consulta/vista para el Front-End.',
            'Consulta SQL / vista validada con datos reales de SALUS y Ficha Metodologica cargada en el Diccionario de Indicadores.'
        ],
        [
            'Lucas\n(Desarrollo Front-End)',
            'Interfaz Visual (UI/UX),\nTableros y Reportes PDF',
            '• Toma las consultas y estructuras de datos limpias preparadas por Matias para cada sector.\n• Construye e integra el Dashboard interactivo del servicio dentro del modulo de Gobernanza de Datos.\n• Configura los filtros por periodo, graficos comparativos, modales de auditoria nominal y alertas visuales.\n• Habilita la exportacion a Excel y el documento PDF institucional del servicio con el resumen metodologico.',
            'Tablero interactivo publicado en el Hub de Gobernanza + Exportacion PDF/Excel operativa para revision con el sector.'
        ]
    ];

    safeAutoTable(doc, {
        startY: y,
        head: [['Integrante y Area', 'Foco Principal Sugerido', 'Actividades Propuestas en cada Sector', 'Entregable que Habilita el Siguiente Paso']],
        body: rolesRows,
        theme: 'grid',
        margin: { left: margin, right: margin },
        headStyles: {
            fillColor: COLORS.navy,
            textColor: COLORS.white,
            fontSize: 7.1,
            fontStyle: 'bold',
            cellPadding: 1.8
        },
        bodyStyles: {
            fontSize: 6.7,
            textColor: COLORS.slateText,
            cellPadding: 1.8,
            lineColor: COLORS.border,
            lineWidth: 0.2,
            valign: 'top'
        },
        alternateRowStyles: {
            fillColor: COLORS.lightBg
        },
        columnStyles: {
            0: { cellWidth: 30, fontStyle: 'bold', textColor: COLORS.navy },
            1: { cellWidth: 32, fontStyle: 'bold', textColor: COLORS.accentBlue },
            2: { cellWidth: 76 },
            3: { cellWidth: contentWidth - 138 }
        }
    });

    y = doc.lastAutoTable.finalY + 3.8;

    // SECCIÓN 2: EL FLUJO EN "CADENA DE MONTAJE" (4 ETAPAS POR SECTOR)
    y = drawSectionBanner(
        doc,
        y,
        margin,
        contentWidth,
        '2',
        'PROPUESTA DE FLUJO EN 4 ETAPAS POR SECTOR (ESQUEMA ESCALONADO)',
        'Sugerencia para trabajar de forma desacoplada: mientras se relevan nuevos sectores, se procesan los datos de los anteriores'
    );

    const etapasRows = [
        [
            'Etapa 1\nRelevamiento y Escucha',
            'Pamela\n(Jefa de TyS)',
            'Visita al sector (30-45 min), grabacion en vivo en el modulo de Entrevistas de Gobernanza y definicion de las preguntas de negocio que el jefe de servicio necesita responder con datos.',
            'Audio procesado por IA + Requerimientos cargados en el proyecto del sector.'
        ],
        [
            'Etapa 2\nModelado y Auditoria SQL',
            'Matias\n(Analista de Datos)',
            'Mapeo de los requerimientos contra las tablas de SALUS, validacion de consistencia numerica, armado del endpoint o vista en Supabase y redaccion de la ficha tecnica del KPI.',
            'Datos estructurados y auditados + Ficha en Diccionario de Indicadores.'
        ],
        [
            'Etapa 3\nMaquetacion Front-End',
            'Lucas\n(Front-End)',
            'Conectividad de los datos al componente visual en React/Vite, armado de tarjetas KPI, curvas temporales, desglose por obra social/profesional y generador PDF del servicio.',
            'Dashboard del sector activo en plataforma + PDF tecnico descargable.'
        ],
        [
            'Etapa 4\nMuestra y Cierre Sectorial',
            'Pamela + Equipo\ncon Jefe de Sector',
            'Presentacion breve del tablero terminado al referente del sector para confirmar que los indicadores reflejan la realidad operativa, aplicando ajustes finos si fueran necesarios.',
            'Sector marcado al 100% de completitud y documentado para auditoria.'
        ]
    ];

    safeAutoTable(doc, {
        startY: y,
        head: [['Etapa del Flujo', 'Responsable Sugerido', 'Descripcion de la Actividad', 'Resultado / Estado en Plataforma']],
        body: etapasRows,
        theme: 'grid',
        margin: { left: margin, right: margin, bottom: 16 },
        headStyles: {
            fillColor: COLORS.navy,
            textColor: COLORS.white,
            fontSize: 7.1,
            fontStyle: 'bold',
            cellPadding: 1.8
        },
        bodyStyles: {
            fontSize: 6.7,
            textColor: COLORS.slateText,
            cellPadding: 1.7,
            lineColor: COLORS.border,
            lineWidth: 0.2,
            valign: 'middle'
        },
        alternateRowStyles: {
            fillColor: COLORS.lightBg
        },
        columnStyles: {
            0: { cellWidth: 32, fontStyle: 'bold', textColor: COLORS.navy },
            1: { cellWidth: 28, fontStyle: 'bold', textColor: COLORS.emerald },
            2: { cellWidth: 80 },
            3: { cellWidth: contentWidth - 140, fontStyle: 'bold' }
        }
    });

    // ─── PÁGINA 2: AGRUPACIÓN DE LOS 29 SECTORES EN 4 OLEADAS Y CRONOGRAMA SUGERIDO ───
    doc.addPage();
    drawInstitutionalHeader(
        doc,
        pageWidth,
        margin,
        logoBase64,
        'PLANIFICACION DE 29 SECTORES',
        'Agrupacion por Afinidad de Datos y Cronograma Sugerido'
    );
    y = 40;

    y = drawSectionBanner(
        doc,
        y,
        margin,
        contentWidth,
        '3',
        'SUGERENCIA DE AGRUPACION DE LOS 29 SECTORES EN 4 OLEADAS POR AFINIDAD',
        'Agrupar sectores que comparten las mismas tablas de SALUS permite que Matias y Lucas reutilicen el 80% del trabajo entre un sector y otro'
    );

    const oleadasRows = [
        [
            'Oleada 1\nBase Troncal Ya Montada\n(Sectores 1 al 6)',
            '1. Quirofano Central\n2. Hospital de Dia Quirurgico\n3. Cuidados Criticos (UCI / Intermedios)\n4. Guardia Clinica y Emergencias\n5. Diagnostico por Imagenes (DxI)\n6. Vigilancia Epidemiologica y Neurocirugia',
            'TABLEAU_Quirofano\nTABLEAU_Admisiones\nVLISE_Visitas\nVLISE_Peticiones*\nTABLEAU_Diagnosticos',
            'Tableros e infraestructura 100% construidos. Sugerencia: utilizar esta base ya funcionando para completar o refinar las entrevistas con sus jefaturas y cerrar los primeros 6 sectores rapidamente.'
        ],
        [
            'Oleada 2\nInternacion y Area\nMaterno-Infantil\n(Sectores 7 al 13)',
            '7. Internado General Adultos (Pisos)\n8. Maternidad y Obstetricia\n9. Neonatologia (UCIN)\n10. Sala de Partos y Recepcion RN\n11. Internado Pediatrico\n12. Gestion de Camas y Giro Cama\n13. Enfermeria de Internacion',
            'TABLEAU_Admisiones\nMovimientos de Cama\nCenso Diario y Horas\nFormularios de Enfermeria',
            'Alta reutilizacion tecnica: la logica de Censo de Medianoche, Horas Exactas, Estancia Media (ALOS) y Giro Cama ya esta programada en el motor de UCI; Matias solo adapta los filtros por unidad de internacion.'
        ],
        [
            'Oleada 3\nApoyo Clinico, Diagnostico\ny Ambulatorio\n(Sectores 14 al 21)',
            '14. Consultorios Externos (Ambulatorio)\n15. Laboratorio Central\n16. Hemoterapia y Med. Transfusional\n17. Anatomia Patologica (Biopsias)\n18. Kinesiologia General y Piso\n19. Cardiologia Diagnostica\n20. Endoscopia Digestiva\n21. Guardia Pediatrica / Especialidades',
            'VLISE_Visitas (Turnos)\nVLISE_Peticiones*\nSER_HojaTransfusional\nPrestaciones Facturadas',
            'Mismo patron de indicadores que Diagnostico por Imagenes: volumen de estudios/consultas, tasa de ausentismo (No-Show), demora de entrega de informes (SLA), profesionales realizadores y obras sociales.'
        ],
        [
            'Oleada 4\nGestion Operativa,\nCalidad y Soporte\n(Sectores 22 al 29)',
            '22. Admision y Entrega de Fichas\n23. Control de Altas Administrativas\n24. Facturacion y Liquidaciones\n25. Garantias y Cuentas Corrientes\n26. Farmacia y Esterilizacion\n27. Infectologia y Control de IACS\n28. Calidad y Seguridad del Paciente\n29. Contact Center y Experiencia Paciente',
            'Tablas Supabase ADM-QUI\nFacturacion Internada\nConsumos de Farmacia\nIndicadores de Calidad',
            'Gran parte de estos modulos (Admision, Altas, Facturacion, Garantias, Laboratorios y Contact Center) ya operan en el sistema ADM-QUI; solo requieren consolidar su ficha de Gobernanza y entrevista de validacion.'
        ]
    ];

    safeAutoTable(doc, {
        startY: y,
        head: [['Oleada Sugerida', 'Sectores Incluidos (Total: 29 Sectores)', 'Fuentes Principales SALUS / BD', 'Ventaja Practica para el Equipo (Por que en este orden)']],
        body: oleadasRows,
        theme: 'grid',
        margin: { left: margin, right: margin },
        headStyles: {
            fillColor: COLORS.navy,
            textColor: COLORS.white,
            fontSize: 7.2,
            fontStyle: 'bold',
            cellPadding: 2.2
        },
        bodyStyles: {
            fontSize: 6.75,
            textColor: COLORS.slateText,
            cellPadding: 2.1,
            lineColor: COLORS.border,
            lineWidth: 0.2,
            valign: 'top'
        },
        alternateRowStyles: {
            fillColor: COLORS.lightBg
        },
        columnStyles: {
            0: { cellWidth: 31, fontStyle: 'bold', textColor: COLORS.navy },
            1: { cellWidth: 52, fontStyle: 'bold' },
            2: { cellWidth: 36, textColor: COLORS.accentBlue },
            3: { cellWidth: contentWidth - 119 }
        }
    });

    y = doc.lastAutoTable.finalY + 5.5;

    // SECCIÓN 4: EJEMPLO DE CRONOGRAMA ESCALONADO POR SEMANA
    y = drawSectionBanner(
        doc,
        y,
        margin,
        contentWidth,
        '4',
        'EJEMPLO SUGERIDO DE CRONOGRAMA ESCALONADO (SEMANA A SEMANA)',
        'Como sincronizar las agendas de Pamela, Matias y Lucas para sostener un ritmo constante sin cuellos de botella'
    );

    const cronogramaRows = [
        [
            'Semana 1\n(Puesta a Punto)',
            'Realiza entrevistas de validacion en Oleada 1 y agenda las primeras 4 visitas de Oleada 2 (Internacion).',
            'Onboarding en el esquema SQL de SALUS y revision de las consultas ya creadas en los 5 tableros actuales.',
            'Prepara componentes visuales reutilizables y deja lista la plantilla base para recibir los nuevos sectores.',
            '6 sectores base revisados + 4 relevados'
        ],
        [
            'Semana 2\n(Oleada 2 - Parte A)',
            'Entrevista a 4 nuevos sectores (ej. fin de Oleada 2 e inicio de Oleada 3 - Apoyo Diagnostico).',
            'Modela en SQL y limpia los datos de los 4 sectores de Internacion que Pamela entrevisto en la Semana 1.',
            'Maqueta los tableros de Internacion a medida que Matias libera cada vista SQL.',
            '10 de 29 sectores en proceso/activos'
        ],
        [
            'Semana 3\n(Oleada 2 - Parte B)',
            'Avanza con 4 entrevistas de Oleada 3 (Consultorios, Laboratorio, Hemoterapia, Anatomia Patologica).',
            'Procesa en SALUS los datos de los 4 sectores relevados por Pamela en la Semana 2.',
            'Publica en produccion los tableros de Semana 2 y arma las vistas de Semana 3.',
            '14 de 29 sectores completados'
        ],
        [
            'Semanas 4 y 5\n(Oleada 3 Completa)',
            'Completa las entrevistas de Oleada 3 e inicia las visitas de Oleada 4 (Calidad, Farmacia, Gestion).',
            'Modela las consultas de productividad ambulatoria, SLA de informes y prestaciones de apoyo.',
            'Integra los tableros de Apoyo Clinico y Ambulatorio con sus exportaciones PDF/Excel.',
            '22 de 29 sectores completados'
        ],
        [
            'Semanas 6 y 7\n(Oleada 4 y Cierre)',
            'Concluye las ultimas entrevistas de Oleada 4 y realiza la ronda final de validacion con las jefaturas.',
            'Consolida los indicadores de Farmacia, Infectologia, Calidad y modulos administrativos.',
            'Publica los ultimos tableros y emite el dossier PDF completo de los 29 sectores.',
            '29 de 29 sectores (100% Meta Final)'
        ]
    ];

    safeAutoTable(doc, {
        startY: y,
        head: [['Periodo Sugerido', 'Agenda de Pamela (TyS / Entrevistas)', 'Agenda de Matias (Datos / SQL)', 'Agenda de Lucas (Front-End)', 'Avance Acumulado']],
        body: cronogramaRows,
        theme: 'grid',
        margin: { left: margin, right: margin },
        headStyles: {
            fillColor: COLORS.navy,
            textColor: COLORS.white,
            fontSize: 7.0,
            fontStyle: 'bold',
            cellPadding: 2.1
        },
        bodyStyles: {
            fontSize: 6.65,
            textColor: COLORS.slateText,
            cellPadding: 2.0,
            lineColor: COLORS.border,
            lineWidth: 0.2,
            valign: 'top'
        },
        alternateRowStyles: {
            fillColor: COLORS.lightBg
        },
        columnStyles: {
            0: { cellWidth: 26, fontStyle: 'bold', textColor: COLORS.navy },
            1: { cellWidth: 44 },
            2: { cellWidth: 44 },
            3: { cellWidth: 42 },
            4: { cellWidth: contentWidth - 156, fontStyle: 'bold', textColor: COLORS.emerald }
        }
    });

    // ─── PÁGINA 3: HERRAMIENTAS YA DISPONIBLES, CHECKLIST POR SECTOR Y DINÁMICA SEMANAL ───
    doc.addPage();
    drawInstitutionalHeader(
        doc,
        pageWidth,
        margin,
        logoBase64,
        'HERRAMIENTAS Y COORDINACION',
        'Modulos Disponibles, Checklist por Sector y Dinamica Semanal'
    );
    y = 40;

    y = drawSectionBanner(
        doc,
        y,
        margin,
        contentWidth,
        '5',
        'HERRAMIENTAS QUE YA TENEMOS EN LA PLATAFORMA PARA FACILITAR EL TRABAJO',
        'El sistema cuenta con modulos especificos para que cada integrante registre su parte en un unico lugar centralizado'
    );

    const herramientasRows = [
        [
            '1. Grabador IA de Entrevistas\n(Pestana Proyectos -> Entrevistas)',
            'Pamela\n(Jefa de TyS)',
            'Permite grabar la reunion con el referente del sector directamente desde el navegador o celular, transcribe el audio y genera automaticamente un resumen estructurado con los dolores, requerimientos y KPIs mencionados.',
            'Ahorra horas de tipeo de minutas y deja respaldo auditado de cada visita.'
        ],
        [
            '2. Gestor de Requerimientos\n(Pestana Proyectos -> Requerimientos)',
            'Pamela y Matias',
            'Lista de pedidos concretos por sector (ej. "Medir demora de biopsias", "Tasa de ausentismo por consultorio") con estado (Pendiente, En Proceso, Completado) que actualiza automaticamente la barra de % de completitud del proyecto.',
            'Permite saber exactamente que pidio cada jefe de servicio y que falta construir.'
        ],
        [
            '3. Diccionario de Indicadores\n(Pestana Indicadores / KPIs)',
            'Matias\n(Analista de Datos)',
            'Catalogo centralizado donde se documenta cada indicador: nombre, formula de calculo, tabla de origen en SALUS, periodicidad, meta esperada y responsable del dato.',
            'Estandariza las definiciones para que todo el Sanatorio mida los indicadores con el mismo criterio.'
        ],
        [
            '4. Hub de Tableros y Exportacion PDF\n(Pestana Dashboards + Docs)',
            'Lucas\n(Front-End)',
            'Arquitectura visual en React/Vite conectada a Supabase y SALUS, con generacion automatica de reportes PDF institucionales y planillas Excel de auditoria nominal para cada servicio.',
            'Entrega inmediata de valor visual para las jefaturas y respaldo documental para auditorias.'
        ]
    ];

    safeAutoTable(doc, {
        startY: y,
        head: [['Modulo de la Plataforma', 'Usuario Principal', 'Como Ayuda en el Trabajo Diario', 'Beneficio para el Equipo']],
        body: herramientasRows,
        theme: 'grid',
        margin: { left: margin, right: margin },
        headStyles: {
            fillColor: COLORS.navy,
            textColor: COLORS.white,
            fontSize: 7.2,
            fontStyle: 'bold',
            cellPadding: 2.2
        },
        bodyStyles: {
            fontSize: 6.85,
            textColor: COLORS.slateText,
            cellPadding: 2.1,
            lineColor: COLORS.border,
            lineWidth: 0.2,
            valign: 'top'
        },
        alternateRowStyles: {
            fillColor: COLORS.lightBg
        },
        columnStyles: {
            0: { cellWidth: 42, fontStyle: 'bold', textColor: COLORS.navy },
            1: { cellWidth: 28, fontStyle: 'bold', textColor: COLORS.accentBlue },
            2: { cellWidth: 68 },
            3: { cellWidth: contentWidth - 138 }
        }
    });

    y = doc.lastAutoTable.finalY + 5.5;

    // SECCIÓN 6: CHECKLIST ESTÁNDAR DE 5 PASOS POR CADA SECTOR
    y = drawSectionBanner(
        doc,
        y,
        margin,
        contentWidth,
        '6',
        'CHECKLIST SUGERIDO POR CADA SECTOR (LOS 5 PASOS PARA DARLO POR COMPLETADO)',
        'Estandar simple y repetible aplicable a cualquiera de los 29 sectores del Sanatorio'
    );

    const checklistRows = [
        ['Paso 1', 'Creacion de la tarjeta del sector en "Proyectos de Datos" y agendamiento de la entrevista con el referente.', 'Pamela (TyS)'],
        ['Paso 2', 'Realizacion de la entrevista, grabacion con IA en la plataforma y carga de los 3 a 6 requerimientos clave.', 'Pamela (TyS)'],
        ['Paso 3', 'Extraccion y limpieza de los datos en SALUS SQL Server + carga de las Fichas Metodologicas en "Indicadores".', 'Matias (Datos)'],
        ['Paso 4', 'Construccion del Dashboard interactivo del sector y su reporte descargable en PDF/Excel.', 'Lucas (Front-End)'],
        ['Paso 5', 'Muestra del tablero al referente del sector, ajustes finos si aplica y cierre de requerimientos al 100%.', 'Equipo Completo']
    ];

    safeAutoTable(doc, {
        startY: y,
        head: [['Orden', 'Hito / Actividad de Verificacion por Sector', 'Responsable Sugerido']],
        body: checklistRows,
        theme: 'grid',
        margin: { left: margin, right: margin },
        headStyles: {
            fillColor: COLORS.navy,
            textColor: COLORS.white,
            fontSize: 7.2,
            fontStyle: 'bold',
            cellPadding: 2.1
        },
        bodyStyles: {
            fontSize: 6.9,
            textColor: COLORS.slateText,
            cellPadding: 2.0,
            lineColor: COLORS.border,
            lineWidth: 0.2
        },
        alternateRowStyles: {
            fillColor: COLORS.lightBg
        },
        columnStyles: {
            0: { cellWidth: 18, fontStyle: 'bold', textColor: COLORS.navy, halign: 'center' },
            1: { cellWidth: contentWidth - 52 },
            2: { cellWidth: 34, fontStyle: 'bold', textColor: COLORS.emerald }
        }
    });

    y = doc.lastAutoTable.finalY + 5.5;

    // SECCIÓN 7: SUGERENCIA DE DINÁMICA DE COORDINACIÓN SEMANAL
    y = drawSectionBanner(
        doc,
        y,
        margin,
        contentWidth,
        '7',
        'SUGERENCIA DE COORDINACION SEMANAL ENTRE PAMELA, MATIAS Y LUCAS',
        'Tres encuentros breves de 15 a 20 minutos por semana para mantener fluidez y resolver dudas tecnicas al instante'
    );

    const ritualesRows = [
        [
            'Lunes (15-20 min)\nOrganizacion de la Semana',
            'Pamela, Matias y Lucas',
            'Repasar brevemente que sectores visitara Pamela en la semana, que entrevistas de la semana anterior pasan a manos de Matias para modelado SQL y que consultas ya validadas pasan a Lucas para armar su interfaz en el Front-End.'
        ],
        [
            'Miercoles (15-20 min)\nSincronizacion Datos + UI',
            'Matias y Lucas\n(con apoyo de Pamela si hay dudas de negocio)',
            'Revisar la estructura de los datos extraidos de SALUS de los sectores de la semana, verificar que los numeros cierren correctamente y definir como se mostraran visualmente en las tarjetas y graficos.'
        ],
        [
            'Viernes (15-20 min)\nRevision de Avances',
            'Pamela, Matias y Lucas',
            'Ver en pantalla los nuevos tableros integrados durante la semana, actualizar el porcentaje de avance en la plataforma y dejar listos los enlaces/PDFs para validar con los jefes de sector.'
        ]
    ];

    safeAutoTable(doc, {
        startY: y,
        head: [['Instancia Sugerida', 'Participantes', 'Objetivo Practico de la Reunion']],
        body: ritualesRows,
        theme: 'grid',
        margin: { left: margin, right: margin },
        headStyles: {
            fillColor: COLORS.navy,
            textColor: COLORS.white,
            fontSize: 7.2,
            fontStyle: 'bold',
            cellPadding: 2.1
        },
        bodyStyles: {
            fontSize: 6.85,
            textColor: COLORS.slateText,
            cellPadding: 2.0,
            lineColor: COLORS.border,
            lineWidth: 0.2
        },
        alternateRowStyles: {
            fillColor: COLORS.lightBg
        },
        columnStyles: {
            0: { cellWidth: 38, fontStyle: 'bold', textColor: COLORS.navy },
            1: { cellWidth: 38, fontStyle: 'bold', textColor: COLORS.accentBlue },
            2: { cellWidth: contentWidth - 76 }
        }
    });

    y = doc.lastAutoTable.finalY + 5.5;

    // Caja de cierre constructivo
    doc.setFillColor(...COLORS.softGreenBg);
    doc.setDrawColor(167, 243, 208);
    doc.setLineWidth(0.35);
    doc.roundedRect(margin, y, contentWidth, 20, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.0);
    doc.setTextColor(...COLORS.emerald);
    doc.text('NOTA FINAL: FLEXIBILIDAD Y ADAPTACION A LA AGENDA INSTITUCIONAL', margin + 4, y + 5.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.1);
    doc.setTextColor(...COLORS.slateText);
    const notaFinal = 'Esta propuesta busca servir como guia practica inicial para organizar el trabajo entre TyS, Analisis de Datos y Desarrollo Front-End. El orden de las oleadas y la cantidad de sectores por semana pueden ajustarse libremente segun la disponibilidad de los jefes de servicio y las prioridades que defina Pamela desde la Jefatura de Tecnologia y Sistemas.';
    const notaLines = doc.splitTextToSize(notaFinal, contentWidth - 8);
    doc.text(notaLines, margin + 4, y + 10.5);

    // Numeración y Pie de Página Institucional
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setDrawColor(...COLORS.border);
        doc.setLineWidth(0.3);
        doc.line(margin, pageHeight - 13, pageWidth - margin, pageHeight - 13);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.2);
        doc.setTextColor(...COLORS.navy);
        doc.text('Sanatorio Argentino  |  Innovacion y Transformacion Digital', margin, pageHeight - 8);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.8);
        doc.setTextColor(...COLORS.slateMuted);
        doc.text(
            'Propuesta Sugerida de Metodologia y Flujo de Trabajo Colaborativo — Proyecto de Gobernanza de Datos (29 Sectores)',
            margin,
            pageHeight - 4.2
        );

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.2);
        doc.setTextColor(...COLORS.navy);
        doc.text(`Pagina ${i} de ${totalPages}`, pageWidth - margin, pageHeight - 6, { align: 'right' });
    }

    const fileName = 'Propuesta_Metodologia_Trabajo_Gobernanza_29_Sectores.pdf';
    return { doc, fileName };
}

export async function generateGobernanzaPropuestaTrabajoPdf(logoDataUrlOverride = null) {
    const logoBase64 = await loadCircularLogo(logoDataUrlOverride);
    const { doc, fileName } = buildGobernanzaPropuestaTrabajoPdfDoc(logoBase64);
    doc.save(fileName);
    return fileName;
}
