import fs from 'fs';
import path from 'path';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// Colores institucionales estándar Sanatorio Argentino
const COLORS = {
    navyHeader: [13, 59, 102],     // #0D3B66 - Azul Marino Sanatorio
    accentBlue: [2, 132, 199],     // #0284C7 - Azul Institucional
    accentLight: [239, 246, 255],  // #EFF6FF - Fondo suave azul
    darkText: [30, 41, 59],        // #1E293B - Texto principal
    subtitleText: [180, 200, 220], // #B4C8DC - Subtítulo header
    mutedText: [100, 116, 139],    // #64748B - Texto secundario
    lightGray: [248, 250, 252],    // #F8FAFC - Fondo tarjetas
    borderColor: [226, 232, 240],  // #E2E8F0 - Bordes suaves
    white: [255, 255, 255],
    green: [16, 185, 129],         // #10B981 - Verde métricas positivas
    greenDark: [5, 150, 105],      // #059669
    greenBg: [236, 253, 245],      // #ECFDF5
    amber: [217, 119, 6],          // #D97706
    amberBg: [254, 243, 199],      // #FEF3C7
};

async function generatePropuestaSalarialPdf() {
    console.log('Iniciando generación de propuesta salarial ejecutiva en PDF...');
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
            console.log('✓ Fuentes Montserrat cargadas.');
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

    // Cabecera institucional
    function drawHeader(pageNum = 1) {
        doc.setFillColor(...COLORS.navyHeader);
        doc.rect(0, 0, pageW, 32, 'F');

        // Logo circular
        const logoX = margin + 1;
        const logoY = 8;
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
        doc.setFontSize(14);
        doc.setFont(fontName, 'bold');
        doc.setTextColor(...COLORS.white);
        doc.text('SANATORIO ARGENTINO', margin + 19, 14);

        doc.setFontSize(8);
        doc.setFont(fontName, 'normal');
        doc.setTextColor(...COLORS.subtitleText);
        doc.text('Gerencia General · Transformación Digital, Operaciones y Sistemas', margin + 19, 21);

        // Badge superior derecho
        doc.setFontSize(10.5);
        doc.setFont(fontName, 'bold');
        doc.setTextColor(...COLORS.white);
        doc.text('PROPUESTA DE ADECUACIÓN SALARIAL', pageW - margin, 14, { align: 'right' });

        doc.setFontSize(7.5);
        doc.setFont(fontName, 'normal');
        doc.setTextColor(...COLORS.subtitleText);
        doc.text('Informe Ejecutivo & Análisis de Retorno de Inversión (ROI)', pageW - margin, 21, { align: 'right' });

        // Línea de acento azul institucional
        doc.setFillColor(...COLORS.accentBlue);
        doc.rect(0, 32, pageW, 2, 'F');
    }

    // Footers
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
            doc.text('Sanatorio Argentino SRL · Confidencial · Presentado por Lic. Lucas Marinero a Gerencia General', margin, pageH - 7);
            doc.text(`Página ${i} de ${pageCount}`, pageW - margin, pageH - 7, { align: 'right' });
        }
    }

    // ═════════════════════════════════════════════════════════════════════
    // PÁGINA 1: CONTEXTO, ANÁLISIS DE ROL Y SUSTITUCIÓN DE ASISTECLICK
    // ═════════════════════════════════════════════════════════════════════
    drawHeader(1);
    let y = 40;

    // Tarjeta de Metadatos Ejecutivos
    doc.setFillColor(...COLORS.lightGray);
    doc.roundedRect(margin, y, colW, 18, 3, 3, 'F');
    doc.setDrawColor(...COLORS.borderColor);
    doc.roundedRect(margin, y, colW, 18, 3, 3, 'S');

    const infoItems = [
        { label: 'PRESENTA / PROFESIONAL', value: 'Lic. Lucas Marinero' },
        { label: 'DESTINATARIO', value: 'Sergio (Gerencia General)' },
        { label: 'FECHA DE PRESENTACIÓN', value: 'Octubre 2026' },
        { label: 'PROPUESTA ECONÓMICA', value: '$4.000.000 (Neto en mano)' },
    ];

    const cellW = colW / 4;
    infoItems.forEach((item, i) => {
        const x = margin + cellW * i + 4;
        doc.setFontSize(6);
        doc.setFont(fontName, 'normal');
        doc.setTextColor(...COLORS.mutedText);
        doc.text(item.label, x, y + 5.5);

        doc.setFontSize(i === 3 ? 8.5 : 8);
        doc.setFont(fontName, 'bold');
        doc.setTextColor(i === 3 ? COLORS.accentBlue[0] : COLORS.navyHeader[0], i === 3 ? COLORS.accentBlue[1] : COLORS.navyHeader[1], i === 3 ? COLORS.accentBlue[2] : COLORS.navyHeader[2]);
        doc.text(item.value, x, y + 12.5);
    });

    y += 24;

    // Sección 1: Introducción y Contexto Histórico
    doc.setFillColor(...COLORS.accentBlue);
    doc.rect(margin, y, 3, 6, 'F');
    doc.setFontSize(10);
    doc.setFont(fontName, 'bold');
    doc.setTextColor(...COLORS.navyHeader);
    doc.text('1. CONTEXTO HISTÓRICO Y EVOLUCIÓN DE LA REMUNERACIÓN', margin + 6, y + 5);
    y += 9;

    doc.setFontSize(8.2);
    doc.setFont(fontName, 'normal');
    doc.setTextColor(...COLORS.darkText);
    const p1 = "El presente documento formaliza una propuesta de adecuación y actualización salarial dirigida a la Gerencia General de Sanatorio Argentino. Para enmarcar con transparencia y total claridad la solicitud, resulta importante precisar los antecedentes:";
    const splitP1 = doc.splitTextToSize(p1, colW);
    doc.text(splitP1, margin, y);
    y += splitP1.length * 4.2 + 2;

    // Callout de aclaración histórica
    doc.setFillColor(...COLORS.accentLight);
    doc.roundedRect(margin, y, colW, 20, 2.5, 2.5, 'F');
    doc.setDrawColor(186, 230, 253);
    doc.roundedRect(margin, y, colW, 20, 2.5, 2.5, 'S');

    doc.setFontSize(7.5);
    doc.setFont(fontName, 'bold');
    doc.setTextColor(...COLORS.navyHeader);
    doc.text('ACLARACIÓN SOBRE LA ACTUALIZACIÓN PREVIA RECIBIDA HACE 3 MESES:', margin + 4, y + 5);

    doc.setFontSize(7.6);
    doc.setFont(fontName, 'normal');
    doc.setTextColor(...COLORS.darkText);
    const calloutTxt = "Al momento de mi incorporación al Sanatorio, la propuesta y pauta de ingreso acordada fue de $3.000.000. Dicho valor se hizo efectivo recién a los 6 meses de iniciadas mis funciones. En consecuencia, la actualización percibida hace 3 meses no constituyó un incremento por mérito o ampliación de tareas, sino el cumplimiento y regularización formal del esquema inicial de ingreso. Hoy, ante una profunda evolución del puesto y la generación tangible de valor, se eleva la presente propuesta a $4.000.000 netos.";
    const splitCallout = doc.splitTextToSize(calloutTxt, colW - 8);
    doc.text(splitCallout, margin + 4, y + 10);

    y += 25;

    // Sección 2: Matriz Comparativa de Responsabilidades
    doc.setFillColor(...COLORS.accentBlue);
    doc.rect(margin, y, 3, 6, 'F');
    doc.setFontSize(10);
    doc.setFont(fontName, 'bold');
    doc.setTextColor(...COLORS.navyHeader);
    doc.text('2. EVOLUCIÓN DEL PUESTO: DE ROL INICIAL A LIDERAZGO TECNOLÓGICO', margin + 6, y + 5);
    y += 8;

    doc.setFontSize(8.2);
    doc.setFont(fontName, 'normal');
    doc.setTextColor(...COLORS.darkText);
    const p2 = "El perímetro de responsabilidades que desempeño en la actualidad supera sustancialmente el perfil originalmente previsto para la posición, evolucionando hacia un rol de Arquitectura, Ingeniería de Soluciones Médicas e Inteligencia Artificial:";
    const splitP2 = doc.splitTextToSize(p2, colW);
    doc.text(splitP2, margin, y);
    y += splitP2.length * 4.2 + 2;

    autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        styles: {
            font: fontName,
            fontSize: 7.2,
            cellPadding: 2.2,
            lineColor: COLORS.borderColor,
            lineWidth: 0.2,
            textColor: COLORS.darkText
        },
        headStyles: {
            fillColor: COLORS.navyHeader,
            textColor: COLORS.white,
            fontStyle: 'bold',
            fontSize: 7.5
        },
        columnStyles: {
            0: { cellWidth: 32, fontStyle: 'bold', fillColor: [241, 245, 249] },
            1: { cellWidth: 46 },
            2: { cellWidth: 54, fontStyle: 'bold', textColor: COLORS.navyHeader },
            3: { cellWidth: 50, textColor: COLORS.greenDark }
        },
        head: [['Eje de Gestión', 'Alcance Previsto Inicialmente', 'Alcance Real Ejecutado (Actual)', 'Impacto Institucional Directo']],
        body: [
            [
                'Plataforma Contact Center',
                'Operación básica y supervisión de chats sobre plataforma de terceros.',
                'Diseño, programación y despliegue in-house de Consola Omnicanal completa con IA, triage y SLA en vivo.',
                'Soberanía total, 0 costo de licencias externas y soporte técnico inmediato sin intermediarios.'
            ],
            [
                'Integración Hospitalaria (SALUS)',
                'Carga manual o consultas aisladas de pacientes en sistemas desarticulados.',
                'Conexión directa en tiempo real con SQL Server de SALUS (padrón 360°, turnos online, historia clínica y grupos familiares).',
                'Eliminación de duplicación de datos, reducción de colas en mesa de entrada y atención ágil al paciente.'
            ],
            [
                'Inteligencia Artificial y Auditoría',
                'No contemplado en el perfil de contratación original.',
                'Integración de visión computacional (GPT-4o Vision) para auditar recetas/órdenes médicas y resúmenes automáticos.',
                'Detección anticipada de requisitos de obras sociales, previniendo débitos y rechazos prestacionales.'
            ],
            [
                'Ecosistema Digital Sanatorio',
                'Gestión de tareas operativas y mantenimiento puntual.',
                'Colaboración activa en 9 sistemas (Admisión Quirúrgica ADM-QUI, Calidad, Fichadas RRHH, OSP TXT, etc.).',
                'Alineación estratégica y modernización integral de los procesos clínicos y administrativos.'
            ]
        ]
    });

    y = doc.lastAutoTable.finalY + 8;

    // Sección 3: Retorno de Inversión y Sustitución de AsisteClick
    doc.setFillColor(...COLORS.accentBlue);
    doc.rect(margin, y, 3, 6, 'F');
    doc.setFontSize(10);
    doc.setFont(fontName, 'bold');
    doc.setTextColor(...COLORS.navyHeader);
    doc.text('3. IMPACTO ECONÓMICO DIRECTO: RETIRO DE ASISTECLICK Y AHORRO RECURRENTE', margin + 6, y + 5);
    y += 8;

    doc.setFontSize(8.2);
    doc.setFont(fontName, 'normal');
    doc.setTextColor(...COLORS.darkText);
    const p3 = "Uno de los mayores hitos de gestión y optimización de costos para el Sanatorio ha sido la sustitución definitiva de la plataforma comercial tercerizada AsisteClick por nuestra propia solución desarrollada internamente:";
    const splitP3 = doc.splitTextToSize(p3, colW);
    doc.text(splitP3, margin, y);
    y += splitP3.length * 4.2 + 2;

    autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        styles: {
            font: fontName,
            fontSize: 7.2,
            cellPadding: 2.2,
            lineColor: COLORS.borderColor,
            lineWidth: 0.2,
            textColor: COLORS.darkText
        },
        headStyles: {
            fillColor: COLORS.navyHeader,
            textColor: COLORS.white,
            fontStyle: 'bold',
            fontSize: 7.5
        },
        columnStyles: {
            0: { cellWidth: 45, fontStyle: 'bold' },
            1: { cellWidth: 68, textColor: [185, 28, 28] }, // Rojo suave anterior
            2: { cellWidth: 69, textColor: COLORS.greenDark, fontStyle: 'bold' }
        },
        head: [['Concepto / Variable', 'Esquema Anterior (AsisteClick)', 'Esquema Actual Propio (Desarrollo Interno)']],
        body: [
            [
                'Costo Fijo de Licenciamiento',
                'Abono mensual en dólares por cantidad de agentes activas (costo recurrente e indexado).',
                '$0 ARS en licencias SaaS de terceros. Capacidad ilimitada de operadoras sin costo adicional.'
            ],
            [
                'Costo Variable por Conversación',
                'Comisiones y recargos por volumen de mensajes y sesiones de pacientes.',
                'Conexión directa vía API oficial con consumo mínimo de infraestructura en la nube.'
            ],
            [
                'Propiedad Intelectual y Datos',
                'Base de datos alojada en servidores de terceros sin acceso directo al modelo de datos.',
                '100% propiedad de Sanatorio Argentino en Supabase / PostgreSQL con backup auditado.'
            ],
            [
                'Flexibilidad y Adaptación',
                'Dependencia de soporte externo y semanas de espera para cambios en el chatbot.',
                'Ajustes inmediatos en tiempo real, adaptados a la dinámica médica del Sanatorio.'
            ]
        ]
    });

    // ═════════════════════════════════════════════════════════════════════
    // PÁGINA 2: GOBERNANZA DE DATOS, PROPUESTA ECONÓMICA Y CONCLUSIÓN
    // ═════════════════════════════════════════════════════════════════════
    doc.addPage();
    drawHeader(2);
    y = 40;

    // Sección 4: Nuevo Eje Estratégico - Gobernanza de Datos
    doc.setFillColor(...COLORS.accentBlue);
    doc.rect(margin, y, 3, 6, 'F');
    doc.setFontSize(10);
    doc.setFont(fontName, 'bold');
    doc.setTextColor(...COLORS.navyHeader);
    doc.text('4. NUEVO ESTRATÉGICO: PROYECTO INSTITUCIONAL DE GOBERNANZA DE DATOS', margin + 6, y + 5);
    y += 8;

    doc.setFontSize(8.2);
    doc.setFont(fontName, 'normal');
    doc.setTextColor(...COLORS.darkText);
    const p4 = "Como siguiente salto de madurez institucional, el Sanatorio pondrá en marcha el Proyecto Integral de Gobernanza de Datos (auditoría médica, captura y transcripción de entrevistas clínicas con IA, diarización y minutas de calidad). Ante este desafío, propongo formalmente absorber su liderazgo y ejecución técnica dentro de mi jornada horaria:";
    const splitP4 = doc.splitTextToSize(p4, colW);
    doc.text(splitP4, margin, y);
    y += splitP4.length * 4.2 + 2;

    // Tarjeta destacada de Gobernanza
    doc.setFillColor(...COLORS.lightGray);
    doc.roundedRect(margin, y, colW, 30, 2.5, 2.5, 'F');
    doc.setDrawColor(...COLORS.borderColor);
    doc.roundedRect(margin, y, colW, 30, 2.5, 2.5, 'S');

    doc.setFontSize(8);
    doc.setFont(fontName, 'bold');
    doc.setTextColor(...COLORS.navyHeader);
    doc.text('VENTAJAS CLAVE DE LA EJECUCIÓN IN-HOUSE DE GOBERNANZA DE DATOS:', margin + 4, y + 5.5);

    doc.setFontSize(7.4);
    doc.setFont(fontName, 'normal');
    doc.setTextColor(...COLORS.darkText);
    const gobTxt = "• Sinergia de Carga Horaria: Utilizar las horas asignadas de forma estructurada y ordenada para diseñar la arquitectura de datos, evitando contrataciones paralelas de consultoría externa.\n• Ahorro de Consultoría Especializada: La contratación de una firma externa de Data Governance y BI hospitalario representa un costo de miles de dólares mensuales. Al ejecutarlo internamente, el Sanatorio retiene el conocimiento técnico y el código fuente.\n• Integración Nativa con SALUS y Calidad: Al conocer a fondo la estructura de bases de datos de SALUS y el circuito de calidad, la implementación es inmediata, reduciendo a cero la curva de aprendizaje de terceros.";
    const splitGob = doc.splitTextToSize(gobTxt, colW - 8);
    doc.text(splitGob, margin + 4, y + 11.5);

    y += 36;

    // Sección 5: Cuadro Resumen Económico
    doc.setFillColor(...COLORS.accentBlue);
    doc.rect(margin, y, 3, 6, 'F');
    doc.setFontSize(10);
    doc.setFont(fontName, 'bold');
    doc.setTextColor(...COLORS.navyHeader);
    doc.text('5. SÍNTESIS DE LA PROPUESTA ECONÓMICA Y BALANCE COSTO-BENEFICIO', margin + 6, y + 5);
    y += 8;

    autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        styles: {
            font: fontName,
            fontSize: 7.4,
            cellPadding: 2.8,
            lineColor: COLORS.borderColor,
            lineWidth: 0.2,
            textColor: COLORS.darkText
        },
        headStyles: {
            fillColor: COLORS.navyHeader,
            textColor: COLORS.white,
            fontStyle: 'bold',
            fontSize: 7.8
        },
        columnStyles: {
            0: { cellWidth: 55, fontStyle: 'bold' },
            1: { cellWidth: 42, halign: 'center' },
            2: { cellWidth: 45, halign: 'center', fontStyle: 'bold', textColor: COLORS.accentBlue },
            3: { cellWidth: 40, halign: 'center', fontStyle: 'bold', textColor: COLORS.greenDark }
        },
        head: [['Concepto / Componente', 'Valor Previo', 'Propuesta Solicitada', 'Retorno Estimado para SA']],
        body: [
            [
                'Remuneración Mensual Neta (En mano)',
                '$3.000.000 ARS',
                '$4.000.000 ARS',
                'Inversión en capital humano estratégico'
            ],
            [
                'Ahorro por Reemplazo de AsisteClick',
                '- USD / Licencias SaaS',
                '$0 ARS en terceros',
                '+$1.000.000 a +$1.500.000 ARS/mes'
            ],
            [
                'Proyecto Gobernanza de Datos (In-House)',
                'Requiere consultoría ext.',
                'Absorbido internamente',
                'Ahorro de miles de USD en honorarios'
            ],
            [
                'Desarrollo Continuo y Soporte 24/7',
                'Horas de desarrollo estándar',
                'Liderazgo técnico proactivo',
                'Continuidad operativa garantizada'
            ]
        ]
    });

    y = doc.lastAutoTable.finalY + 8;

    // Tarjeta Conclusión Ejecutiva
    doc.setFillColor(...COLORS.greenBg);
    doc.roundedRect(margin, y, colW, 28, 2.5, 2.5, 'F');
    doc.setDrawColor(167, 243, 208);
    doc.roundedRect(margin, y, colW, 28, 2.5, 2.5, 'S');

    doc.setFontSize(8.2);
    doc.setFont(fontName, 'bold');
    doc.setTextColor(...COLORS.greenDark);
    doc.text('BALANCED SCORECARD: IMPACTO NETO POSITIVO PARA EL SANATORIO', margin + 4, y + 6);

    doc.setFontSize(7.6);
    doc.setFont(fontName, 'normal');
    doc.setTextColor(...COLORS.darkText);
    const balanceTxt = "El ajuste salarial propuesto de +$1.000.000 netos mensuales queda ampliamente amortizado por el ahorro directo recurrente obtenido al dar de baja AsisteClick y por la absorción del Proyecto de Gobernanza de Datos sin recurrir a consultoras de software externas. El Sanatorio obtiene una solución técnica propia, más rápida, integrada a SALUS y con soporte continuo, garantizando una relación costo-beneficio altamente favorable.";
    const splitBalance = doc.splitTextToSize(balanceTxt, colW - 8);
    doc.text(splitBalance, margin + 4, y + 12);

    y += 36;

    // Firma y Agradecimiento
    doc.setFontSize(8);
    doc.setFont(fontName, 'normal');
    doc.setTextColor(...COLORS.darkText);
    doc.text('Agradezco enormemente la confianza y el espacio brindado por la Gerencia General para continuar transformando digitalmente nuestra institución.', margin, y);

    y += 18;

    // Línea de firma
    doc.setDrawColor(...COLORS.borderColor);
    doc.setLineWidth(0.5);
    doc.line(margin + 5, y, margin + 70, y);

    doc.setFontSize(8.5);
    doc.setFont(fontName, 'bold');
    doc.setTextColor(...COLORS.navyHeader);
    doc.text('Lic. Lucas Marinero', margin + 5, y + 5);

    doc.setFontSize(7.2);
    doc.setFont(fontName, 'normal');
    doc.setTextColor(...COLORS.mutedText);
    doc.text('Innovación, Transformación Digital & Operaciones\nSanatorio Argentino', margin + 5, y + 9);

    addFooters();

    const outputDir = path.resolve('public');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    const outputPath = path.join(outputDir, 'Propuesta_Adecuacion_Salarial_Lucas_Marinero.pdf');
    const rootOutputPath = path.resolve('Propuesta_Adecuacion_Salarial_Lucas_Marinero.pdf');

    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
    fs.writeFileSync(outputPath, pdfBuffer);
    fs.writeFileSync(rootOutputPath, pdfBuffer);

    console.log(`✓ PDF generado exitosamente en:`);
    console.log(`  1. ${outputPath}`);
    console.log(`  2. ${rootOutputPath}`);
}

generatePropuestaSalarialPdf().catch(err => {
    console.error('Error generando PDF:', err);
    process.exit(1);
});
