/**
 * gobernanzaRendicionGobiernoPdf.js
 * Generador del Informe Técnico y Contable de Avance y Rendición de Cuentas
 * para el "Programa de Fortalecimiento de la Economía del Conocimiento" (Anexo I - 2026)
 * Dirección de Economía del Conocimiento — Gobierno de San Juan.
 *
 * Estética Oficial de Sanatorio Argentino:
 * - Membrete azul marino (#0D3B66) con logo circular institucional
 * - Leyenda "Innovación y Transformación Digital"
 * - Sanitización tipográfica total (ISO-8859-1 / WinAnsi) vía installSafePdfText
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

export const RENDICION_GOBIERNO_DATA = {
    programa: 'PROGRAMA DE FORTALECIMIENTO DE LA ECONOMÍA DEL CONOCIMIENTO',
    subtituloPrograma: 'ANEXO I - 2026: Transformación Digital Dirigida a PyMEs Locales · Gobierno de San Juan',
    organismoContralor: 'Dirección de Economía del Conocimiento — Provincia de San Juan',
    razonSocial: 'Sanatorio Argentino S.A. / S.R.L.',
    areaEjecutora: 'Innovación y Transformación Digital',
    representanteLegal: 'C.P. Sergio Femenia (DNI 25.319.500) — Gerente Administrativo',
    fechaPostulacion: '17 de junio de 2026',
    fechaDiagnósticoBase: '21 de febrero de 2026 (ID Reporte: 699af79842eaa9c1ef7971a2)',
    fechaCorteInforme: '29 de octubre de 2026 (Mes 5 de 6 de Ejecución)',
    tituloProyecto: 'Implementación de la Arquitectura de Gobernanza de Datos e Inteligencia Artificial Hospitalaria (RAG) y Asistentes Virtuales Multi-Sectoriales',
    avanceFisicoGlobal: '88,5%',
    avanceFinancieroGlobal: '89,7%',
    avanceAnrEjecutado: '90,0%',
    sectoresPilotoComprometidos: 'Dirección Médica, Jefatura de Kinesiología y Coordinación de Guardia',
    sectoresDesplegadosEfectivos: '5 Macro-Servicios Activos: (1) Dirección Médica y Quirófano Central/HDD, (2) Jefatura de Kinesiología y Cuidados Críticos (UCI), (3) Coordinación de Guardia Clínica e Internado, (4) Vigilancia Epidemiológica (SNVS/C2) y Neurocirugía, y (5) Diagnóstico por Imágenes (DxI).',

    financiamientoConsolidado: [
        {
            concepto: 'Inversión Total Declarada del Proyecto',
            montoaprobado: '$ 21.428.571',
            porcentaje: '100,0%',
            ejecutadoMes5: '$ 19.228.571',
            pctEjecutado: '89,7%',
            saldoMes6: '$ 2.200.000',
            estado: 'En Ejecución Normal (Mes 5/6)'
        },
        {
            concepto: 'Monto Aporte No Reembolsable (ANR — Gobierno de San Juan)',
            montoaprobado: '$ 15.000.000',
            porcentaje: '70,0%',
            ejecutadoMes5: '$ 13.500.000',
            pctEjecutado: '90,0%',
            saldoMes6: '$ 1.500.000',
            estado: 'Bienes y Consultoría 100% | RRHH 5/6 meses'
        },
        {
            concepto: 'Aporte de Contraparte (Financiamiento Propio Sanatorio Argentino)',
            montoaprobado: '$ 6.428.571',
            porcentaje: '30,0%',
            ejecutadoMes5: '$ 5.728.571',
            pctEjecutado: '89,1%',
            saldoMes6: '$ 700.000',
            estado: 'Infraestructura, Licencias y Horas Jefaturas'
        }
    ],

    rubrosAnr: [
        {
            rubro: '1. Bienes de Capital',
            limite: 'Hasta 30% del ANR ($ 4.500.000)',
            asignado: '$ 4.500.000',
            ejecutado: '$ 4.500.000',
            saldo: '$ 0',
            avance: '100,0%',
            detalleContable: 'Adquisición e instalación de infraestructura física de servidores locales de alto rendimiento y Servidor NAS local en red interna con discos en arreglo redundante y cifrado en reposo (Fase 3 y 4 — Mes 2).'
        },
        {
            rubro: '2. Consultoría y Servicios',
            limite: 'Hasta 30% del ANR ($ 4.500.000)',
            asignado: '$ 1.500.000',
            ejecutado: '$ 1.500.000',
            saldo: '$ 0',
            avance: '100,0%',
            detalleContable: 'Servicios especializados externos de auditoría de algoritmos RAG, evaluación de ciberseguridad hospitalaria, control de accesos RBAC y validación clínica de fidelidad de respuestas >95% sin alucinaciones (Fase 7 — Mes 5).'
        },
        {
            rubro: '3. Recursos Humanos',
            limite: 'Hasta 60% del ANR ($ 9.000.000)',
            asignado: '$ 9.000.000',
            ejecutado: '$ 7.500.000',
            saldo: '$ 1.500.000',
            avance: '83,3%',
            detalleContable: 'Honorarios profesionales de 3 perfiles técnicos dedicados full-time ($ 500.000/mes c/u durante 6 meses). Liquidados y certificados los Meses 1 a 5 (Junio a Octubre 2026: $ 7.500.000). Resta Mes 6 (Noviembre 2026: $ 1.500.000).'
        },
        {
            rubro: 'TOTAL CONSOLIDADO ANR',
            limite: '100% del Beneficio ANR',
            asignado: '$ 15.000.000',
            ejecutado: '$ 13.500.000',
            saldo: '$ 1.500.000',
            avance: '90,0%',
            detalleContable: 'Cumplimiento estricto de los topes porcentuales y umbrales salariales fijados en las Bases y Condiciones (Mayo 2026).'
        }
    ],

    equipoRrhh: [
        {
            perfil: 'Ingeniero ETL',
            dedicacion: 'Full-time (6 Meses)',
            honorarioMensual: '$ 500.000',
            presupuestoTotal: '$ 3.000.000',
            devengadoMes1a5: '$ 2.500.000 (5 meses)',
            saldoMes6: '$ 500.000 (1 mes)',
            tareasCertificadas: 'Extracción de repositorios SALUS SQL Server (VLISE_Visitas, TABLEAU_Admisiones, TABLEAU_Quirofano, TABLEAU_Cirugias, SER_HojaTransfusional), consultas con aislamiento NOLOCK, pipelines de sincronización automatizada y aseguramiento de disponibilidad 99,9%.'
        },
        {
            perfil: 'Analista de Datos',
            dedicacion: 'Full-time (6 Meses)',
            honorarioMensual: '$ 500.000',
            presupuestoTotal: '$ 3.000.000',
            devengadoMes1a5: '$ 2.500.000 (5 meses)',
            saldoMes6: '$ 500.000 (1 mes)',
            tareasCertificadas: 'Perfilado de datos clínicos, limpieza y normalización de campos libres, anonimización/resguardo por NHC, diseño de algoritmos de chunking dinámico e indexación semántica en PostgreSQL + pgvector.'
        },
        {
            perfil: 'Desarrollador Full Stack',
            dedicacion: 'Full-time (6 Meses)',
            honorarioMensual: '$ 500.000',
            presupuestoTotal: '$ 3.000.000',
            devengadoMes1a5: '$ 2.500.000 (5 meses)',
            saldoMes6: '$ 500.000 (1 mes)',
            tareasCertificadas: 'Orquestación del backend RAG, integración con modelos LLM, blindaje de system prompts por rol clínico, interfaz web React/Vite de Avatares Sectoriales (Agente Beto IA, Copiloto Clínico y Grabador IA) y 5 Tableros Analíticos.'
        }
    ],

    cronogramaContableMensual: [
        ['Mes 1 (Jun-Jul 2026)', 'Fases 1 y 2', '$ 0', '$ 0', '$ 1.500.000', '$ 1.500.000', '$ 1.150.000', 'Project Charter, Matriz RBAC, ERS y Acuerdos SOW firmados'],
        ['Mes 2 (Jul-Ago 2026)', 'Fases 3 y 4', '$ 4.500.000', '$ 0', '$ 1.500.000', '$ 6.000.000', '$ 1.478.571', 'Servidor NAS + Diccionario SALUS + Pipelines ETL en producción'],
        ['Mes 3 (Ago-Sep 2026)', 'Fase 5', '$ 0', '$ 0', '$ 1.500.000', '$ 1.500.000', '$ 1.050.000', 'Base PostgreSQL + pgvector + Chunking e indexación masiva'],
        ['Mes 4 (Sep-Oct 2026)', 'Fase 6', '$ 0', '$ 500.000', '$ 1.500.000', '$ 2.000.000', '$ 1.050.000', 'Backend RAG + UI Avatares Sectoriales + 5 Tableros Analíticos'],
        ['Mes 5 (Oct 2026 - Actual)', 'Fase 7', '$ 0', '$ 1.000.000', '$ 1.500.000', '$ 2.500.000', '$ 1.000.000', 'Auditoría Q/A, Matriz Fidelidad >95% y Reporte Ciberseguridad'],
        ['Mes 6 (Nov 2026 - Cierre)', 'Fase 8', '$ 0', '$ 0', '$ 1.500.000', '$ 1.500.000', '$ 700.000', 'Despliegue final, Talleres Prompts Hospitalarios y Telemetría'],
        ['TOTAL ACUMULADO', '8 Fases (6m)', '$ 4.500.000', '$ 1.500.000', '$ 9.000.000', '$ 15.000.000', '$ 6.428.571', 'Inversión Total: $ 21.428.571 (70% ANR + 30% Contraparte)']
    ],

    contraparteDesglose: [
        {
            concepto: '1. Dedicación de Jefaturas Médicas y Liderazgo de Innovación (Horas Hombre)',
            monto: '$ 2.850.000',
            ejecutado: '$ 2.550.000',
            detalle: 'Participación de Dirección Médica, Jefatura de Kinesiología, Coordinación de Guardia, UCI, Quirófano y Diagnóstico por Imágenes en talleres de criterios operativos, validación de diccionarios y pruebas UAT.'
        },
        {
            concepto: '2. Licenciamiento, Conectores SQL Server SALUS y Red Interna Segura',
            monto: '$ 2.178.571',
            ejecutado: '$ 2.078.571',
            detalle: 'Adecuación de switches VLAN internos, certificados SSL, licencias de motor relacional/vectorial, conectores de solo lectura hacia SALUS y entorno de staging hospitalario.'
        },
        {
            concepto: '3. Capacitación Interna, Material Pedagógico de Prompts y Gestión del Cambio',
            monto: '$ 1.400.000',
            ejecutado: '$ 1.100.000',
            detalle: 'Organización de talleres prácticos por servicio, elaboración de Manuales de Uso Rápido, Guías de Ingeniería de Prompts Hospitalarios y soporte técnico in-situ.'
        }
    ],

    fasesAvanceTecnico: [
        {
            fase: 'Fase 1 (Mes 1)',
            nombre: 'Definición Estratégica y Alcance Institucional',
            responsable: 'Líder de Innovación / Dirección General y Todo el Equipo',
            entregablesExigidos: '1) Project Charter formal firmado.\n2) Matriz General de Roles, Permisos y Accesos (RBAC) aprobada.',
            estado: '100% CUMPLIDO',
            evidenciaReal: 'Se constituyó el Comité de Gobernanza con Dirección Médica, Jefatura de Kinesiología y Coordinación de Guardia, ampliando el alcance a Quirófano, UCI, Epidemiología y DxI. Se implementó la Matriz RBAC y políticas Row-Level Security (RLS) garantizando secreto médico (Ley 26.529).'
        },
        {
            fase: 'Fase 2 (Mes 1)',
            nombre: 'Relevamiento Funcional y Entrevistas Semánticas',
            responsable: 'Especialista Funcional en Sistema SALUS + Todo el Equipo',
            entregablesExigidos: '1) Especificación de Requerimientos de Software (ERS).\n2) Acuerdos de Alcance (SOW) por sector con conformidad de jefaturas.',
            estado: '100% CUMPLIDO',
            evidenciaReal: 'Se desarrolló e implementó en producción el módulo "Grabador de Relevamiento y Entrevistas con IA" (GobernanzaEntrevistaGrabador), registrando plantillas estructuradas por servicio, transcripción automática y acuerdos de indicadores (53 requerimientos totales relevados y aprobados).'
        },
        {
            fase: 'Fase 3 (Mes 2)',
            nombre: 'Exploración y Auditoría del Sistema SALUS',
            responsable: 'Ingeniero ETL / Analista de Datos',
            entregablesExigidos: '1) Diccionario de Datos detallado de SALUS.\n2) Reporte Técnico de Diagnóstico de Calidad de Datos Hospitalarios.',
            estado: '100% CUMPLIDO',
            evidenciaReal: 'Ingeniería inversa completa del modelo relacional SALUS: mapeo de VLISE_Visitas, TABLEAU_Admisiones, TABLEAU_Quirofano, TurnosQuirurgicos, TABLEAU_Cirugias, TABLEAU_Diagnosticos, SER_HojaTransfusional y PR InstRespEntrada (Protocolos 621 Triage y 382 Epicrisis). Detección y depuración de duplicados (ej. inyecciones de contraste en TC y cirugías programadas en ventana de guardia).'
        },
        {
            fase: 'Fase 4 (Mes 2)',
            nombre: 'Canalización de Datos (Extracción SQL Server y NAS)',
            responsable: 'Ingeniero ETL / Analista de Datos',
            entregablesExigidos: '1) Repositorio de Scripts SQL completamente documentados.\n2) Pipeline de ingesta y sincronización automatizado hacia NAS y staging.',
            estado: '100% CUMPLIDO',
            evidenciaReal: 'Construcción de más de 40 scripts T-SQL optimizados con directivas WITH (NOLOCK) para no afectar la performance transaccional de SALUS. Todos los scripts están documentados e integrados en el visor interactivo "Documentación SQL" de la plataforma y sincronizados con las tablas staging homologadas (serie histórica 2022-2026).'
        },
        {
            fase: 'Fase 5 (Mes 3)',
            nombre: 'Vectorización y Almacenamiento Semántico (PostgreSQL + pgvector)',
            responsable: 'Analista de Datos / Desarrollador Full Stack',
            entregablesExigidos: '1) Base de datos PostgreSQL con pgvector configurada.\n2) Scripts automatizados de preprocesamiento, chunking y vectorización.',
            estado: '100% CUMPLIDO',
            evidenciaReal: 'Despliegue del motor PostgreSQL con extensión vectorial pgvector, funciones RPC de búsqueda semántica y estructuración de evoluciones clínicas, fojas quirúrgicas, estudios complementarios y diccionarios de indicadores hospitalarios con aislamiento estricto por NHC.'
        },
        {
            fase: 'Fase 6 (Mes 4)',
            nombre: 'Programación y Desarrollo de Agentes Multi-Sector y Tableros',
            responsable: 'Desarrollador Full Stack + Analista de Datos',
            entregablesExigidos: '1) Código fuente consolidado (Backend RAG + Frontend UI React).\n2) Interfaz Web con Avatares Sectoriales y Tableros de Control nativos.',
            estado: '100% CUMPLIDO',
            evidenciaReal: 'Aplicación web React + Vite en producción con: (a) Agente Institucional "Beto IA" con generación de reportes oficiales, (b) Copiloto de Historia Clínica y Epicrisis IA con validación por NHC, (c) Asistente de Entrevistas de Gobernanza, y (d) 5 Dashboards Analíticos interactivos: Quirófano/HDD (713 cx/mes), Guardia e Internado (1.830 visitas/mes), UCI y Kinesiología Crítica (16 camas), Epidemiología SNVS/C2 (2.920 casos/año) y Diagnóstico por Imágenes (7.438 estudios/mes).'
        },
        {
            fase: 'Fase 7 (Mes 5)',
            nombre: 'Control de Calidad (Quality Assurance - Q/A) y Validación RAG',
            responsable: 'Ingeniero de Quality Assurance (Q/A)',
            entregablesExigidos: '1) Reporte de Cobertura de Pruebas y Compilación.\n2) Matriz de Validación RAG certificada (Fidelidad > 95%).\n3) Reporte de Vulnerabilidades y Seguridad de Datos Clínicos.',
            estado: '90% EN CIERRE',
            evidenciaReal: 'Compilación automatizada verificada sin errores (4.790 módulos). Implementación de reglas anti-alucinación por anclaje estricto a NHC y episodio clínico (fidelidad auditada > 98,4% en generación de Dossiers de UCI, Guardia y Quirófano). Validación UAT completada con jefaturas médicas.'
        },
        {
            fase: 'Fase 8 (Mes 6)',
            nombre: 'Implementación Final, Adopción y Gestión del Cambio',
            responsable: 'Todo el Equipo del Proyecto',
            entregablesExigidos: '1) Plataforma de IA desplegada en producción interna.\n2) Manuales de Uso Rápido y Guías de Prompts por sector.\n3) Módulo de Auditoría de logs y feedback activo.',
            estado: '40% EN EJECUCIÓN (MES 6)',
            evidenciaReal: 'Los 5 Dossiers Técnicos Oficiales por Servicio ya fueron emitidos y publicados en el repositorio institucional. El módulo de telemetría y auditoría de consultas está operativo. Durante Noviembre 2026 (Mes 6) se completan los talleres presenciales de Ingeniería de Prompts Hospitalarios y el acta de cierre final.'
        }
    ],

    transformacionMadurez: [
        {
            dimension: '1. Nivel de Madurez Digital Global',
            lineaBaseFeb2026: 'Avanzado con brecha de integración ("islas de datos" y sobrecarga por consolidación manual en planillas).',
            metaComprometida: 'Consolidar arquitectura integrada y simplificar circuitos operativos.',
            logroOctubre2026: 'Líder Digital Sectorial: 5 servicios críticos integrados en una plataforma única conectada a SALUS sin planillas intermedias.'
        },
        {
            dimension: '2. Termómetro de Adopción y Visión de IA',
            lineaBaseFeb2026: 'Nivel Asistencial / "IA como Alivio" (uso puntual para tareas aisladas).',
            metaComprometida: 'Evolucionar hacia "IA como Escalador del Negocio" (nivel Operacional / Estratégico).',
            logroOctubre2026: 'Nivel Operacional-Estratégico: Agentes RAG multi-sector activos (Beto IA, Copiloto Clínico, Grabador IA y Generador de Dossiers).'
        },
        {
            dimension: '3. Escala de Gestión de la Información',
            lineaBaseFeb2026: 'Sistematización (registros confiables por área pero sin visión transversal del sanatorio).',
            metaComprometida: 'Integración y Activación (Data-Driven) con Fuente Única de Verdad.',
            logroOctubre2026: 'Activación Data-Driven: Motor Telar y Diccionario de 53 Indicadores al 100% Finalizado con trazabilidad nominal por NHC.'
        },
        {
            dimension: '4. Ciberseguridad y Gobernanza del Dato',
            lineaBaseFeb2026: 'Reglas de carga variables entre prestadores externos y riesgo de duplicación.',
            metaComprometida: 'Esquema RBAC, reglas de validación algorítmica y resguardo de datos sensibles.',
            logroOctubre2026: 'RBAC activo, consultas no bloqueantes (NOLOCK), filtros anti-duplicación automatizados y cumplimiento de Ley 26.529.'
        }
    ]
};

async function loadCircularLogo(logoDataUrlOverride = null) {
    if (logoDataUrlOverride) return logoDataUrlOverride;
    if (typeof window === 'undefined') return null;
    try {
        const logoImg = new Image();
        logoImg.crossOrigin = 'anonymous';
        logoImg.src = '/logosanatorio.png';
        await new Promise((resolve, reject) => {
            logoImg.onload = resolve;
            logoImg.onerror = reject;
        });
        const canvasSize = 220;
        const canvas = document.createElement('canvas');
        canvas.width = canvasSize;
        canvas.height = canvasSize;
        const ctx = canvas.getContext('2d');
        ctx.beginPath();
        ctx.arc(canvasSize / 2, canvasSize / 2, canvasSize / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(logoImg, 0, 0, canvasSize, canvasSize);
        return canvas.toDataURL('image/png');
    } catch {
        return null;
    }
}

function drawInstitutionalHeader(doc, pageWidth, margin, logoBase64, rightBadgeTitle, rightBadgeSub) {
    doc.setFillColor(...COLORS.navy);
    doc.rect(0, 0, pageWidth, 34, 'F');

    doc.setFillColor(...COLORS.skyBlue);
    doc.rect(0, 34, pageWidth, 2, 'F');

    const logoX = margin;
    const logoY = 6;
    const logoSize = 20;

    if (logoBase64) {
        try {
            doc.setFillColor(255, 255, 255);
            doc.circle(logoX + logoSize / 2, logoY + logoSize / 2, logoSize / 2 + 1.2, 'F');
            doc.addImage(logoBase64, 'PNG', logoX, logoY, logoSize, logoSize);
        } catch {
            doc.setFillColor(255, 255, 255);
            doc.circle(logoX + logoSize / 2, logoY + logoSize / 2, logoSize / 2, 'F');
        }
    } else {
        doc.setFillColor(255, 255, 255);
        doc.circle(logoX + logoSize / 2, logoY + logoSize / 2, logoSize / 2, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(...COLORS.navy);
        doc.text('SA', logoX + 7.2, logoY + 11.5);
    }

    const textStartX = margin + logoSize + 5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14.5);
    doc.setTextColor(255, 255, 255);
    doc.text('SANATORIO ARGENTINO', textStartX, 13);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(147, 197, 253);
    doc.text('Innovacion y Transformacion Digital', textStartX, 19.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.8);
    doc.setTextColor(203, 213, 225);
    doc.text('Programa de Fortalecimiento de la Economia del Conocimiento  |  Gobierno de San Juan', textStartX, 25.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text(sanitizePdfText(rightBadgeTitle || 'INFORME TECNICO Y CONTABLE'), pageWidth - margin, 13, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.8);
    doc.setTextColor(186, 230, 253);
    doc.text(sanitizePdfText(rightBadgeSub || 'Anexo I - 2026  |  Estado de Avance Mes 5/6'), pageWidth - margin, 19.5, { align: 'right' });

    doc.setFontSize(7.2);
    doc.setTextColor(203, 213, 225);
    doc.text('Corte Auditado: Octubre 2026', pageWidth - margin, 25.5, { align: 'right' });
}

function drawSectionBanner(doc, y, margin, contentWidth, numberStr, title, subtitle) {
    doc.setFillColor(...COLORS.softBlueBg);
    doc.setDrawColor(191, 219, 254);
    doc.setLineWidth(0.35);
    doc.roundedRect(margin, y, contentWidth, 13.5, 2, 2, 'FD');

    doc.setFillColor(...COLORS.navy);
    doc.roundedRect(margin, y, 3.2, 13.5, 1, 1, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.8);
    doc.setTextColor(...COLORS.navy);
    doc.text(`${numberStr}. ${sanitizePdfText(title)}`, margin + 6, y + 5.8);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.6);
    doc.setTextColor(...COLORS.slateMuted);
    doc.text(sanitizePdfText(subtitle), margin + 6, y + 10.8);

    return y + 17;
}

export function buildGobernanzaRendicionGobiernoPdfDoc(logoBase64 = null) {
    const d = RENDICION_GOBIERNO_DATA;
    const doc = new JsPDFConstructor({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    installSafePdfText(doc);

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 13;
    const contentWidth = pageWidth - margin * 2;
    const bottomSafeY = pageHeight - 24;

    const ensureSpace = (currentY, neededH, badgeRight = 'INFORME TECNICO Y CONTABLE') => {
        if (currentY + neededH > bottomSafeY) {
            doc.addPage();
            drawInstitutionalHeader(doc, pageWidth, margin, logoBase64, badgeRight, 'Anexo I - 2026  |  Rendicion de Avance');
            return 42;
        }
        return currentY;
    };

    // ─── PÁGINA 1: PORTADA EJECUTIVA, FICHA OFICIAL Y CUMPLIMIENTO DEL DIAGNÓSTICO DE MADUREZ ───
    drawInstitutionalHeader(doc, pageWidth, margin, logoBase64, 'INFORME TECNICO Y CONTABLE', 'Anexo I - 2026  |  Estado de Avance Mes 5/6');
    let y = 41;

    // Caja de Identificación Oficial del Expediente
    doc.setFillColor(...COLORS.lightBg);
    doc.setDrawColor(...COLORS.border);
    doc.setLineWidth(0.35);
    doc.roundedRect(margin, y, contentWidth, 38, 2.5, 2.5, 'FD');

    doc.setFillColor(...COLORS.accentBlue);
    doc.roundedRect(margin, y, 3.5, 38, 1.2, 1.2, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...COLORS.accentBlue);
    doc.text('MEMORIA TECNICA Y RENDICION CONTABLE DE AVANCE — ECONOMIA DEL CONOCIMIENTO (SAN JUAN)', margin + 7, y + 5.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(...COLORS.navy);
    const titleLines = doc.splitTextToSize(d.tituloProyecto, contentWidth - 12);
    doc.text(titleLines, margin + 7, y + 11);

    const metaY = y + 11 + titleLines.length * 4.5 + 1.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.6);
    doc.setTextColor(...COLORS.slateText);
    doc.text(`Empresa Beneficiaria: ${d.razonSocial}   |   Area Ejecutora: ${d.areaEjecutora}`, margin + 7, metaY);
    doc.text(`Representante Legal Firmante: ${d.representanteLegal}   |   Postulacion: ${d.fechaPostulacion}`, margin + 7, metaY + 4.5);
    doc.text(`Diagnostico Base: ${d.fechaDiagnósticoBase}   |   Corte de Auditoria: ${d.fechaCorteInforme}`, margin + 7, metaY + 9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.emerald);
    doc.text(`Alcance Ampliado: De 3 sectores piloto comprometidos a 5 Macro-Servicios Hospitalarios en produccion activa.`, margin + 7, metaY + 13.5);

    y += 42;

    // 4 Tarjetas KPI de Síntesis Técnico-Contable
    const kpis = [
        { label: 'AVANCE FISICO TECNICO', value: '88,5% (Mes 5/6)', sub: 'Fases 1 a 6: 100% | Fase 7: 90%', color: COLORS.emerald },
        { label: 'INVERSION TOTAL EJECUTADA', value: '$ 19.228.571', sub: '89,7% sobre $ 21.428.571 totales', color: COLORS.navy },
        { label: 'EJECUCION SUBSIDIO ANR', value: '$ 13.500.000', sub: '90,0% de $ 15.000.000 (Resta Mes 6)', color: COLORS.accentBlue },
        { label: 'APORTE CONTRAPARTE SA', value: '$ 5.728.571', sub: '89,1% de $ 6.428.571 comprometidos', color: COLORS.amber }
    ];

    const gap = 3.5;
    const cardW = (contentWidth - gap * 3) / 4;
    const cardH = 21;

    kpis.forEach((k, idx) => {
        const cx = margin + idx * (cardW + gap);
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(...COLORS.border);
        doc.setLineWidth(0.3);
        doc.roundedRect(cx, y, cardW, cardH, 2, 2, 'FD');

        doc.setFillColor(...k.color);
        doc.roundedRect(cx, y, cardW, 2, 1, 1, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.4);
        doc.setTextColor(...COLORS.slateMuted);
        doc.text(k.label, cx + 3, y + 6.5);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10.2);
        doc.setTextColor(...COLORS.navy);
        doc.text(k.value, cx + 3, y + 12.8);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(...COLORS.slateText);
        doc.text(k.sub, cx + 3, y + 17.8);
    });

    y += cardH + 6;

    // SECCIÓN 1: EVOLUCIÓN RESPECTO AL DIAGNÓSTICO DE MADUREZ DIGITAL (FEB 2026)
    y = drawSectionBanner(
        doc,
        y,
        margin,
        contentWidth,
        '1',
        'RESPUESTA AL DIAGNOSTICO DE MADUREZ DIGITAL (DIRECCION DE ECONOMIA DEL CONOCIMIENTO)',
        'Trazabilidad entre la linea de base oficial del 21/02/2026, las metas del Anexo I y los resultados auditados en Octubre 2026'
    );

    autoTable(doc, {
        startY: y,
        head: [['Dimension Evaluada (Gob. San Juan)', 'Linea de Base (21/02/2026)', 'Meta Comprometida (Anexo I)', 'Resultado Auditado (Octubre 2026)']],
        body: d.transformacionMadurez.map(row => [
            row.dimension,
            row.lineaBaseFeb2026,
            row.metaComprometida,
            row.logroOctubre2026
        ]),
        theme: 'grid',
        margin: { left: margin, right: margin },
        headStyles: {
            fillColor: COLORS.navy,
            textColor: COLORS.white,
            fontSize: 7.5,
            fontStyle: 'bold',
            cellPadding: 2.5
        },
        bodyStyles: {
            fontSize: 7.1,
            textColor: COLORS.slateText,
            cellPadding: 2.3,
            lineColor: COLORS.border,
            lineWidth: 0.2
        },
        alternateRowStyles: {
            fillColor: COLORS.lightBg
        },
        columnStyles: {
            0: { cellWidth: 36, fontStyle: 'bold', textColor: COLORS.navy },
            1: { cellWidth: 46 },
            2: { cellWidth: 42 },
            3: { cellWidth: contentWidth - 124, fontStyle: 'bold', textColor: [5, 102, 70] }
        }
    });

    y = doc.lastAutoTable.finalY + 6;

    // Cumplimiento de los 6 Objetivos SMART (Tabla página 2 del Anexo I)
    y = ensureSpace(y, 65, 'AVANCE TECNICO POR OBJETIVO SMART');
    y = drawSectionBanner(
        doc,
        y,
        margin,
        contentWidth,
        '2',
        'CUMPLIMIENTO DE OBJETIVOS ESPECIFICOS SMART (ANEXO I - PAGINA 2)',
        'Verificacion cuantificable de cada meta comprometida ante el Programa de Economia del Conocimiento'
    );

    const smartRows = [
        [
            'Objetivo SMART 1',
            'Mes 1',
            'Desarrollar una matriz general de control de accesos basados en roles (RBAC) y un Documento de Gobernanza firmado por el 100% de las jefaturas piloto.',
            '100% CUMPLIDO',
            'Project Charter y Matriz RBAC aprobados. Politicas RLS activas y alcance expandido de 3 a 5 servicios hospitalarios.'
        ],
        [
            'Objetivo SMART 2',
            'Mes 2',
            'Implementar los pipelines de extraccion automatizada de datos (ETL) hacia un Servidor NAS local con disponibilidad y sincronizacion del 99,9%.',
            '100% CUMPLIDO',
            'Pipelines ETL operativos sobre SALUS SQL Server (WITH NOLOCK) y Servidor NAS local configurado. Mas de 40 consultas SQL homologadas.'
        ],
        [
            'Objetivo SMART 3',
            'Mes 3',
            'Desplegar un motor de base de datos vectorial basado en PostgreSQL y la extension pgvector que indexe semanticamente el 100% de los documentos seleccionados.',
            '100% CUMPLIDO',
            'Motor PostgreSQL + pgvector en produccion indexando evoluciones HCE, protocolos quirurgicos, epicrisis y 53 indicadores.'
        ],
        [
            'Objetivo SMART 4',
            'Mes 4',
            'Integrar el backend del sistema RAG con una interfaz UI/UX multi-agente que provea un asistente/avatar virtual operativo para cada sector piloto.',
            '100% CUMPLIDO (SUPERADO)',
            'Agente Beto IA, Copiloto Clinico HC/Epicrisis, Grabador de Entrevistas IA y 5 Dashboards Analiticos interactivos en React + Vite.'
        ],
        [
            'Objetivo SMART 5',
            'Mes 5',
            'Certificar mediante auditorias de Quality Assurance (Q/A) una tasa de fidelidad al contexto e inexistencia de alucinaciones en el RAG superior al 95%.',
            '90% EN CIERRE (98,4% FIDELIDAD)',
            'Tasa de fidelidad verificada del 98,4% mediante anclaje deterministico por NHC y validacion cruzada contra vistas SALUS.'
        ],
        [
            'Objetivo SMART 6',
            'Mes 6',
            'Capacitar al 100% del personal medico y administrativo asignado a las areas piloto en el uso de la plataforma y tecnicas de "Ingenieria de Prompts Hospitalarios".',
            'EN EJECUCION (NOV 2026)',
            '5 Dossiers Oficiales PDF y Manuales emitidos. Talleres presenciales programados para el Mes 6 de cierre.'
        ]
    ];

    autoTable(doc, {
        startY: y,
        head: [['Hito SMART', 'Mes', 'Objetivo Comprometido en Anexo I', 'Estado Actual', 'Evidencia Verificable en Sanatorio Argentino']],
        body: smartRows,
        theme: 'grid',
        margin: { left: margin, right: margin },
        headStyles: {
            fillColor: COLORS.navy,
            textColor: COLORS.white,
            fontSize: 7.4,
            fontStyle: 'bold',
            cellPadding: 2.3
        },
        bodyStyles: {
            fontSize: 7,
            textColor: COLORS.slateText,
            cellPadding: 2.2,
            lineColor: COLORS.border,
            lineWidth: 0.2
        },
        alternateRowStyles: {
            fillColor: COLORS.lightBg
        },
        columnStyles: {
            0: { cellWidth: 22, fontStyle: 'bold', textColor: COLORS.navy },
            1: { cellWidth: 13, halign: 'center', fontStyle: 'bold' },
            2: { cellWidth: 56 },
            3: { cellWidth: 28, halign: 'center', fontStyle: 'bold', textColor: COLORS.emerald },
            4: { cellWidth: contentWidth - 119 }
        }
    });

    // ─── PÁGINA 2: AUDITORÍA TÉCNICA DE LAS 8 FASES Y ENTREGABLES ───
    doc.addPage();
    drawInstitutionalHeader(doc, pageWidth, margin, logoBase64, 'MEMORIA TECNICA — 8 FASES', 'Anexo I - Paginas 3 y 7 a 11  |  Entregables Certificados');
    y = 41;

    y = drawSectionBanner(
        doc,
        y,
        margin,
        contentWidth,
        '3',
        'CRONOGRAMA DETALLADO DE ACTIVIDADES Y ENTREGABLES CERTIFICADOS (FASES 1 A 8)',
        'Correspondencia exacta con la Hoja de Ruta de Ejecucion Detallada presentada ante la Direccion de Economia del Conocimiento'
    );

    autoTable(doc, {
        startY: y,
        head: [['Fase / Mes', 'Actividad y Perfil Responsable', 'Entregables Exigidos (Anexo I)', 'Estado', 'Demostracion Tecnica y Evidencia en Produccion']],
        body: d.fasesAvanceTecnico.map(f => [
            f.fase,
            `${f.nombre}\n(${f.responsable})`,
            f.entregablesExigidos,
            f.estado,
            f.evidenciaReal
        ]),
        theme: 'grid',
        margin: { left: margin, right: margin },
        headStyles: {
            fillColor: COLORS.navy,
            textColor: COLORS.white,
            fontSize: 7.3,
            fontStyle: 'bold',
            cellPadding: 2.3
        },
        bodyStyles: {
            fontSize: 6.8,
            textColor: COLORS.slateText,
            cellPadding: 2.1,
            lineColor: COLORS.border,
            lineWidth: 0.2
        },
        alternateRowStyles: {
            fillColor: COLORS.lightBg
        },
        columnStyles: {
            0: { cellWidth: 20, fontStyle: 'bold', textColor: COLORS.navy },
            1: { cellWidth: 36, fontStyle: 'bold' },
            2: { cellWidth: 42 },
            3: { cellWidth: 22, halign: 'center', fontStyle: 'bold', textColor: COLORS.emerald },
            4: { cellWidth: contentWidth - 120 }
        }
    });

    y = doc.lastAutoTable.finalY + 5;

    // Resumen de los 5 Servicios Hospitalarios Desplegados (Demostración de Escala)
    y = ensureSpace(y, 56, 'DEMOSTRACION DE IMPACTO CLINICO');
    y = drawSectionBanner(
        doc,
        y,
        margin,
        contentWidth,
        '4',
        'DEMOSTRACION DE IMPACTO OPERATIVO EN LOS 5 SERVICIOS ACTIVOS DEL SANATORIO',
        'Superacion de metas: de 3 sectores piloto iniciales a 5 macro-servicios hospitalarios auditados con datos reales de SALUS'
    );

    const serviciosImpactoRows = [
        [
            '1. Direccion Medica, Quirofano Central y Hospital de Dia',
            'Sector Piloto #1 (Ampliado)',
            '713 cirugias/mes (575 Qx Central + 114 HDD + 24 Partos)',
            '15 Requerimientos (100% Finalizado)',
            'Control de capacidad instalada (6 quirofanos), auditoria nominal de suspensiones (2,33%), uso de bloques por especialidad, Rx/Lab intraoperatorio y Hemovigilancia.'
        ],
        [
            '2. Jefatura de Kinesiologia y Cuidados Criticos (UCI)',
            'Sector Piloto #2 (Ampliado)',
            '16 camas criticas (8 UTI + 8 Intermedios) | ALOS 4,67 dias',
            '9 Requerimientos (100% Finalizado)',
            'Motor dual de ocupacion (Censo 00:00 vs Horas Exactas), prestaciones de Kinesiologia Critica Respiratoria y Motora, auditoria forense de mortalidad (<48h vs >=48h) y Hemoterapia.'
        ],
        [
            '3. Coordinacion de Guardia Clinica y Seguimiento Internado',
            'Sector Piloto #3 (Ampliado)',
            '1.830 consultas/mes + 1.862 admisiones piso + 3.233 IC',
            '13 Requerimientos (100% Finalizado)',
            'Triage Protocolo 621, curva de espera puerta-medico (<=30m, 31-60m, 61-90m, >90m), conversion quirurgica <=48h depurada, seguimiento en piso y Copiloto IA de Epicrisis.'
        ],
        [
            '4. Vigilancia Epidemiologica (SNVS / C2) y Neurocirugia',
            'Expansion Institucional #4',
            '2.920 notificaciones anuales obligatorias + Neurocirugia',
            '8 Requerimientos (100% Finalizado)',
            'Automatizacion de Planilla C2 del Ministerio de Salud (Bronquiolitis <24 meses, ETI/Influenza, Neumonias, Diarreas, Varicela y ETS) y metricas de Neurocirugia.'
        ],
        [
            '5. Diagnostico por Imagenes (DxI)',
            'Expansion Institucional #5',
            '7.438 estudios efectivos/mes (Eco, Rx, Mamo, TC, DMO)',
            '8 Requerimientos (100% Finalizado)',
            'Filtro algoritmico anti-duplicacion de contrastes en TC, productividad por realizador e informante (SLA en horas), ausentismo (No-Show) y derivacion desde Guardia.'
        ]
    ];

    autoTable(doc, {
        startY: y,
        head: [['Servicio Hospitalario Integrado', 'Condicion en Proyecto', 'Volumen Real Auditado (SALUS)', 'Indicadores', 'Funcionalidades y Entregables Activos en Plataforma']],
        body: serviciosImpactoRows,
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
            fontSize: 6.8,
            textColor: COLORS.slateText,
            cellPadding: 2,
            lineColor: COLORS.border,
            lineWidth: 0.2
        },
        alternateRowStyles: {
            fillColor: COLORS.lightBg
        },
        columnStyles: {
            0: { cellWidth: 38, fontStyle: 'bold', textColor: COLORS.navy },
            1: { cellWidth: 25, fontStyle: 'bold', textColor: COLORS.accentBlue },
            2: { cellWidth: 34, fontStyle: 'bold' },
            3: { cellWidth: 24, halign: 'center', fontStyle: 'bold', textColor: COLORS.emerald },
            4: { cellWidth: contentWidth - 121 }
        }
    });

    // ─── PÁGINA 3: RENDICIÓN CONTABLE Y FINANCIERA DETALLADA (ANEXO I - PÁGINAS 4 Y 5) ───
    doc.addPage();
    drawInstitutionalHeader(doc, pageWidth, margin, logoBase64, 'RENDICION CONTABLE Y FINANCIERA', 'Anexo I - Paginas 4 y 5  |  Ejecucion Presupuestaria ANR y Contraparte');
    y = 41;

    y = drawSectionBanner(
        doc,
        y,
        margin,
        contentWidth,
        '5',
        'ESTADO DE EJECUCION PRESUPUESTARIA Y FINANCIAMIENTO CONSOLIDADO ($ 21.428.571)',
        'Rendicion contable conforme a las bases vigentes (70% Aporte No Reembolsable ANR y 30% Aporte de Contraparte Sanatorio Argentino)'
    );

    autoTable(doc, {
        startY: y,
        head: [['Concepto General Financiero', 'Monto Aprobado ($)', 'Participacion', 'Ejecutado / Devengado (Mes 5)', '% Ejec.', 'Saldo Mes 6 ($)', 'Estado Contable']],
        body: d.financiamientoConsolidado.map(item => [
            item.concepto,
            item.montoaprobado,
            item.porcentaje,
            item.ejecutadoMes5,
            item.pctEjecutado,
            item.saldoMes6,
            item.estado
        ]),
        theme: 'grid',
        margin: { left: margin, right: margin },
        headStyles: {
            fillColor: COLORS.navy,
            textColor: COLORS.white,
            fontSize: 7.3,
            fontStyle: 'bold',
            cellPadding: 2.3
        },
        bodyStyles: {
            fontSize: 7.2,
            textColor: COLORS.slateText,
            cellPadding: 2.3,
            lineColor: COLORS.border,
            lineWidth: 0.2
        },
        columnStyles: {
            0: { cellWidth: 52, fontStyle: 'bold', textColor: COLORS.navy },
            1: { cellWidth: 25, halign: 'right', fontStyle: 'bold' },
            2: { cellWidth: 18, halign: 'center' },
            3: { cellWidth: 26, halign: 'right', fontStyle: 'bold', textColor: COLORS.emerald },
            4: { cellWidth: 14, halign: 'center', fontStyle: 'bold' },
            5: { cellWidth: 22, halign: 'right' },
            6: { cellWidth: contentWidth - 157 }
        }
    });

    y = doc.lastAutoTable.finalY + 5;

    // Desglose por Rubros Elegibles Financiados por ANR ($ 15.000.000)
    y = drawSectionBanner(
        doc,
        y,
        margin,
        contentWidth,
        '6',
        'RENDICION POR RUBROS ELEGIBLES FINANCIADOS POR ANR ($ 15.000.000)',
        'Verificacion de topes reglamentarios: Bienes de Capital (30%), Consultoria y Servicios (10%) y Recursos Humanos (60%)'
    );

    autoTable(doc, {
        startY: y,
        head: [['Rubro Elegible ANR', 'Tope Maximo Permitido', 'Monto Asignado', 'Ejecutado al Mes 5', 'Saldo Mes 6', '% Avance', 'Imputacion Contable y Respaldo Documental']],
        body: d.rubrosAnr.map(r => [
            r.rubro,
            r.limite,
            r.asignado,
            r.ejecutado,
            r.saldo,
            r.avance,
            r.detalleContable
        ]),
        theme: 'grid',
        margin: { left: margin, right: margin },
        headStyles: {
            fillColor: COLORS.navy,
            textColor: COLORS.white,
            fontSize: 7.1,
            fontStyle: 'bold',
            cellPadding: 2.2
        },
        bodyStyles: {
            fontSize: 6.9,
            textColor: COLORS.slateText,
            cellPadding: 2.1,
            lineColor: COLORS.border,
            lineWidth: 0.2
        },
        alternateRowStyles: {
            fillColor: COLORS.lightBg
        },
        columnStyles: {
            0: { cellWidth: 28, fontStyle: 'bold', textColor: COLORS.navy },
            1: { cellWidth: 26 },
            2: { cellWidth: 21, halign: 'right', fontStyle: 'bold' },
            3: { cellWidth: 21, halign: 'right', fontStyle: 'bold', textColor: COLORS.emerald },
            4: { cellWidth: 18, halign: 'right' },
            5: { cellWidth: 14, halign: 'center', fontStyle: 'bold' },
            6: { cellWidth: contentWidth - 128 }
        }
    });

    y = doc.lastAutoTable.finalY + 5;

    // Desglose Nominal de Recursos Humanos Contratados ($ 9.000.000 ANR)
    y = drawSectionBanner(
        doc,
        y,
        margin,
        contentWidth,
        '7',
        'CERTIFICACION DE RECURSOS HUMANOS ESPECIALIZADOS (ANR: $ 9.000.000)',
        '3 Perfiles Tecnicos Full-Time x 6 Meses x $ 500.000/mes (Cumplimiento del umbral salarial minimo de las bases)'
    );

    autoTable(doc, {
        startY: y,
        head: [['Rol Tecnico / Perfil', 'Dedicacion', 'Honorario / Mes', 'Total Rubro (6m)', 'Certificado Mes 1-5', 'Saldo Mes 6', 'Funciones y Entregables Auditados en el Proyecto']],
        body: d.equipoRrhh.map(p => [
            p.perfil,
            p.dedicacion,
            p.honorarioMensual,
            p.presupuestoTotal,
            p.devengadoMes1a5,
            p.saldoMes6,
            p.tareasCertificadas
        ]),
        theme: 'grid',
        margin: { left: margin, right: margin },
        headStyles: {
            fillColor: COLORS.navy,
            textColor: COLORS.white,
            fontSize: 7.1,
            fontStyle: 'bold',
            cellPadding: 2.2
        },
        bodyStyles: {
            fontSize: 6.9,
            textColor: COLORS.slateText,
            cellPadding: 2.1,
            lineColor: COLORS.border,
            lineWidth: 0.2
        },
        columnStyles: {
            0: { cellWidth: 26, fontStyle: 'bold', textColor: COLORS.navy },
            1: { cellWidth: 20, halign: 'center' },
            2: { cellWidth: 19, halign: 'right' },
            3: { cellWidth: 21, halign: 'right', fontStyle: 'bold' },
            4: { cellWidth: 23, halign: 'right', fontStyle: 'bold', textColor: COLORS.emerald },
            5: { cellWidth: 19, halign: 'right' },
            6: { cellWidth: contentWidth - 128 }
        }
    });

    // ─── PÁGINA 4: FLUJO DE FONDO MENSUAL, CONTRAPARTE, RIESGOS Y DECLARACIÓN JURADA ───
    doc.addPage();
    drawInstitutionalHeader(doc, pageWidth, margin, logoBase64, 'CRONOGRAMA CONTABLE Y CIERRE', 'Anexo I - Paginas 5 y 6  |  Flujo Mensual, Contraparte y Conformidad');
    y = 41;

    y = drawSectionBanner(
        doc,
        y,
        margin,
        contentWidth,
        '8',
        'FLUJO CONTABLE MENSUAL DE DEVENGAMIENTO POR RUBRO (MES 1 A MES 6)',
        'Curva de inversion mensual articulada con los hitos tecnicos del cronograma oficial (Junio a Noviembre 2026)'
    );

    autoTable(doc, {
        startY: y,
        head: [['Periodo / Mes', 'Fases', 'Bienes Cap. (ANR)', 'Consultoria (ANR)', 'RR.HH. (ANR)', 'Subtotal ANR', 'Contraparte SA', 'Hito / Comprobante Tecnico Vinculado']],
        body: d.cronogramaContableMensual,
        theme: 'grid',
        margin: { left: margin, right: margin },
        headStyles: {
            fillColor: COLORS.navy,
            textColor: COLORS.white,
            fontSize: 6.9,
            fontStyle: 'bold',
            cellPadding: 2.1
        },
        bodyStyles: {
            fontSize: 6.8,
            textColor: COLORS.slateText,
            cellPadding: 2,
            lineColor: COLORS.border,
            lineWidth: 0.2
        },
        alternateRowStyles: {
            fillColor: COLORS.lightBg
        },
        didParseCell: (data) => {
            if (data.section === 'body' && data.row.index === d.cronogramaContableMensual.length - 1) {
                data.cell.styles.fontStyle = 'bold';
                data.cell.styles.fillColor = COLORS.softBlueBg;
                data.cell.styles.textColor = COLORS.navy;
            }
        },
        columnStyles: {
            0: { cellWidth: 28, fontStyle: 'bold' },
            1: { cellWidth: 16, halign: 'center' },
            2: { cellWidth: 20, halign: 'right' },
            3: { cellWidth: 20, halign: 'right' },
            4: { cellWidth: 19, halign: 'right' },
            5: { cellWidth: 21, halign: 'right', fontStyle: 'bold', textColor: COLORS.navy },
            6: { cellWidth: 20, halign: 'right' },
            7: { cellWidth: contentWidth - 144 }
        }
    });

    y = doc.lastAutoTable.finalY + 5;

    // Rendición del Aporte de Contraparte de Sanatorio Argentino ($ 6.428.571)
    y = drawSectionBanner(
        doc,
        y,
        margin,
        contentWidth,
        '9',
        'INTEGRACION DEL APORTE DE CONTRAPARTE — SANATORIO ARGENTINO ($ 6.428.571 — 30%)',
        'Detalle de recursos propios aportados por la institucion para garantizar la sustentabilidad operativa del proyecto'
    );

    autoTable(doc, {
        startY: y,
        head: [['Concepto de Contraparte Institucional', 'Presupuesto ($)', 'Ejecutado Mes 5 ($)', 'Detalle Tecnico-Contable de Afectacion']],
        body: d.contraparteDesglose.map(c => [
            c.concepto,
            c.monto,
            c.ejecutado,
            c.detalle
        ]),
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
            fontSize: 6.9,
            textColor: COLORS.slateText,
            cellPadding: 2.1,
            lineColor: COLORS.border,
            lineWidth: 0.2
        },
        columnStyles: {
            0: { cellWidth: 48, fontStyle: 'bold', textColor: COLORS.navy },
            1: { cellWidth: 24, halign: 'right', fontStyle: 'bold' },
            2: { cellWidth: 26, halign: 'right', fontStyle: 'bold', textColor: COLORS.emerald },
            3: { cellWidth: contentWidth - 98 }
        }
    });

    y = doc.lastAutoTable.finalY + 6;

    // Caja de Declaración Jurada y Coherencia Institucional (Anexo I - Página 6)
    y = ensureSpace(y, 58, 'DECLARACION JURADA Y FIRMAS');
    doc.setFillColor(...COLORS.softGreenBg);
    doc.setDrawColor(167, 243, 208);
    doc.setLineWidth(0.35);
    doc.roundedRect(margin, y, contentWidth, 24, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.2);
    doc.setTextColor(...COLORS.emerald);
    doc.text('RATIFICACION DE COHERENCIA INSTITUCIONAL Y CARACTER DE DECLARACION JURADA (ANEXO I - PUNTO 7)', margin + 4, y + 5.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.3);
    doc.setTextColor(...COLORS.slateText);
    const ddjjText = 'Sanatorio Argentino ratifica que: (1) La ejecucion tecnica responde de forma directa al Diagnostico de Madurez Digital elaborado por la Direccion de Economia del Conocimiento; (2) Los 6 objetivos SMART poseen indicadores cuantificables verificados en produccion; (3) El cronograma se ejecuta dentro del plazo maximo de 6 meses; (4) La ejecucion contable respeta estrictamente los topes por rubro (30% Bienes de Capital, 10% Consultoria, 60% RR.HH.) y el umbral salarial de $ 500.000 mensuales por profesional; y (5) Toda la informacion consignada en el presente informe tecnico-contable reviste caracter de Declaracion Jurada.';
    const ddjjLines = doc.splitTextToSize(ddjjText, contentWidth - 8);
    doc.text(ddjjLines, margin + 4, y + 10.5);

    // Bloque de Firmas Oficiales
    const sigY = y + 44;
    doc.setDrawColor(...COLORS.slateMuted);
    doc.setLineWidth(0.35);

    // Firma 1: Representante Legal / Gerente Administrativo
    doc.line(margin + 12, sigY, margin + 82, sigY);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.2);
    doc.setTextColor(...COLORS.navy);
    doc.text('C.P. SERGIO FEMENIA', margin + 47, sigY + 4.5, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(...COLORS.slateText);
    doc.text('DNI 25.319.500 — Gerente Administrativo / Rep. Legal', margin + 47, sigY + 8.5, { align: 'center' });
    doc.text('SANATORIO ARGENTINO S.A. / S.R.L.', margin + 47, sigY + 12.2, { align: 'center' });

    // Firma 2: Responsable Técnico / Innovación y Transformación Digital
    doc.line(pageWidth - margin - 82, sigY, pageWidth - margin - 12, sigY);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.2);
    doc.setTextColor(...COLORS.navy);
    doc.text('DIRECCION TECNICA DE PROYECTO', pageWidth - margin - 47, sigY + 4.5, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(...COLORS.slateText);
    doc.text('Area de Innovacion y Transformacion Digital', pageWidth - margin - 47, sigY + 8.5, { align: 'center' });
    doc.text('Gobernanza de Datos Clinicos e IA Hospitalaria', pageWidth - margin - 47, sigY + 12.2, { align: 'center' });

    // Numeración y Pie de Página Institucional en todas las hojas
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
            'Rendicion Tecnica y Contable — Programa de Fortalecimiento de la Economia del Conocimiento (Gobierno de San Juan)',
            margin,
            pageHeight - 4.2
        );

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.2);
        doc.setTextColor(...COLORS.navy);
        doc.text(`Pagina ${i} de ${totalPages}`, pageWidth - margin, pageHeight - 6, { align: 'right' });
    }

    const fileName = 'Informe_Tecnico_Contable_Economia_Conocimiento_Sanatorio_Argentino_2026.pdf';
    return { doc, fileName };
}

export async function generateGobernanzaRendicionGobiernoPdf(logoDataUrlOverride = null) {
    const logoBase64 = await loadCircularLogo(logoDataUrlOverride);
    const { doc, fileName } = buildGobernanzaRendicionGobiernoPdfDoc(logoBase64);
    doc.save(fileName);
    return fileName;
}
