/**
 * gobernanzaRendicionGobiernoPdf.js
 * Generador del Informe Técnico y Contable de Avance Intermedio y Rendición de Cuentas
 * para el "Programa de Fortalecimiento de la Economía del Conocimiento" (Anexo I - 2026)
 * Dirección de Economía del Conocimiento — Gobierno de San Juan.
 *
 * Estado Real Auditado:
 * - Arquitectura, Infraestructura Física/NAS, Pipelines ETL SALUS, Base Vectorial PostgreSQL,
 *   Tableros Analíticos de los 5 Servicios y Grabador IA de Entrevistas: 100% MONTADOS Y OPERATIVOS.
 * - Trabajo de Campo (Entrevistas Semánticas con Jefaturas, Ajuste Fino de Avatares por Sector y Talleres):
 *   EN EJECUCIÓN (respaldado por la infraestructura propia ya desplegada).
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
    fechaCorteInforme: 'Octubre 2026 — Corte Intermedio de Ejecución (Arquitectura 100% Montada | Etapa de Entrevistas Activa)',
    tituloProyecto: 'Implementación de la Arquitectura de Gobernanza de Datos e Inteligencia Artificial Hospitalaria (RAG) y Asistentes Virtuales Multi-Sectoriales',
    avanceFisicoGlobal: '62,5%',
    avanceInfraestructura: '100,0%',
    avanceFinancieroGlobal: '64,3%',
    avanceAnrEjecutado: '65,0%',
    sectoresPilotoComprometidos: 'Dirección Médica, Jefatura de Kinesiología y Coordinación de Guardia',
    sectoresDesplegadosEfectivos: 'Infraestructura y Tableros de Datos ya montados en 5 Macro-Servicios: (1) Dirección Médica y Quirófano Central/HDD, (2) Jefatura de Kinesiología y Cuidados Críticos (UCI), (3) Coordinación de Guardia Clínica e Internado, (4) Vigilancia Epidemiológica (SNVS/C2) y Neurocirugía, y (5) Diagnóstico por Imágenes (DxI). Etapa actual: Ejecución de entrevistas semánticas con referentes de cada sector.',

    resumenEstrategicoEstadoActual: 'El proyecto presenta un hito técnico fundamental: Sanatorio Argentino adelantó y completó al 100% el montaje de toda la arquitectura tecnológica, la infraestructura de servidores/almacenamiento, la ingeniería inversa de SALUS SQL Server, los pipelines de extracción ETL, la base de datos PostgreSQL + pgvector, los 5 Tableros Analíticos en vivo y un módulo propio de Grabación y Procesamiento de Entrevistas con IA. Actualmente nos encontramos en la etapa de ejecución de las entrevistas de relevamiento semántico con los referentes médicos y administrativos de cada servicio, contando ya con toda la infraestructura y los datos reales en línea para alimentar los asistentes virtuales.',

    financiamientoConsolidado: [
        {
            concepto: 'Inversión Total Declarada del Proyecto',
            montoaprobado: '$ 21.428.571',
            porcentaje: '100,0%',
            ejecutadoMes5: '$ 13.778.571',
            pctEjecutado: '64,3%',
            saldoMes6: '$ 7.650.000',
            estado: 'Infraestructura 100% | En Etapa de Entrevistas'
        },
        {
            concepto: 'Monto Aporte No Reembolsable (ANR — Gobierno de San Juan)',
            montoaprobado: '$ 15.000.000',
            porcentaje: '70,0%',
            ejecutadoMes5: '$ 9.750.000',
            pctEjecutado: '65,0%',
            saldoMes6: '$ 5.250.000',
            estado: 'Bienes Capital 100% | Consultoría y RRHH 50%'
        },
        {
            concepto: 'Aporte de Contraparte (Financiamiento Propio Sanatorio Argentino)',
            montoaprobado: '$ 6.428.571',
            porcentaje: '30,0%',
            ejecutadoMes5: '$ 4.028.571',
            pctEjecutado: '62,7%',
            saldoMes6: '$ 2.400.000',
            estado: 'Red y Conectores 100% | Resta Horas Entrevistas/UAT'
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
            detalleContable: 'EJECUTADO AL 100%: Adquisición, montaje y puesta en marcha de la infraestructura física de servidores locales de alto rendimiento y almacenamiento NAS seguro para soporte de las extracciones de SALUS y base de datos hospitalaria.'
        },
        {
            rubro: '2. Consultoría y Servicios',
            limite: 'Hasta 30% del ANR ($ 4.500.000)',
            asignado: '$ 1.500.000',
            ejecutado: '$ 750.000',
            saldo: '$ 750.000',
            avance: '50,0%',
            detalleContable: 'EN EJECUCIÓN (50%): Completado el diseño de arquitectura de seguridad, aislamiento de red y esquema RBAC inicial ($ 750.000). El 50% restante ($ 750.000) se ejecuta en Fase 7 para la auditoría final de fidelidad clínica del RAG una vez concluidas las entrevistas por servicio.'
        },
        {
            rubro: '3. Recursos Humanos',
            limite: 'Hasta 60% del ANR ($ 9.000.000)',
            asignado: '$ 9.000.000',
            ejecutado: '$ 4.500.000',
            saldo: '$ 4.500.000',
            avance: '50,0%',
            detalleContable: 'EN EJECUCIÓN (3 de 6 meses devengados): Honorarios de los 3 perfiles técnicos full-time ($ 500.000/mes c/u) correspondientes al montaje de infraestructura, ETL SALUS, base PostgreSQL y plataforma base ($ 4.500.000). Restan 3 meses ($ 4.500.000) para el procesamiento de entrevistas, ajuste de avatares, Q/A y capacitación.'
        },
        {
            rubro: 'TOTAL CONSOLIDADO ANR',
            limite: '100% del Beneficio ANR',
            asignado: '$ 15.000.000',
            ejecutado: '$ 9.750.000',
            saldo: '$ 5.250.000',
            avance: '65,0%',
            detalleContable: 'Cumplimiento estricto de topes por rubro (Mayo 2026). El 100% del equipamiento y arquitectura base ya se encuentra montado y operativo en el Sanatorio.'
        }
    ],

    equipoRrhh: [
        {
            perfil: 'Ingeniero ETL',
            dedicacion: 'Full-time (6 Meses)',
            honorarioMensual: '$ 500.000',
            presupuestoTotal: '$ 3.000.000',
            devengadoMes1a5: '$ 1.500.000 (3 meses)',
            saldoMes6: '$ 1.500.000 (3 meses)',
            tareasCertificadas: 'YA EJECUTADO: Ingeniería inversa de SALUS SQL Server, más de 40 scripts T-SQL con aislamiento NOLOCK y pipelines de sincronización (2022-2026) operativos. PRÓXIMA ETAPA: Incorporación de nuevas vistas específicas que surjan de las entrevistas con jefaturas.'
        },
        {
            perfil: 'Analista de Datos',
            dedicacion: 'Full-time (6 Meses)',
            honorarioMensual: '$ 500.000',
            presupuestoTotal: '$ 3.000.000',
            devengadoMes1a5: '$ 1.500.000 (3 meses)',
            saldoMes6: '$ 1.500.000 (3 meses)',
            tareasCertificadas: 'YA EJECUTADO: Limpieza y normalización de las 5 áreas hospitalarias, depuración de duplicados y despliegue de PostgreSQL + pgvector. PRÓXIMA ETAPA: Indexación semántica de los cuestionarios y reglas de negocio relevadas en las entrevistas de campo.'
        },
        {
            perfil: 'Desarrollador Full Stack',
            dedicacion: 'Full-time (6 Meses)',
            honorarioMensual: '$ 500.000',
            presupuestoTotal: '$ 3.000.000',
            devengadoMes1a5: '$ 1.500.000 (3 meses)',
            saldoMes6: '$ 1.500.000 (3 meses)',
            tareasCertificadas: 'YA EJECUTADO: Plataforma web React + Vite, Grabador IA de Entrevistas con plantillas por servicio, motor base de Agentes (Beto IA / Copiloto) y los 5 Tableros Analíticos. PRÓXIMA ETAPA: Entrenamiento fino de los System Prompts de cada Avatar según las entrevistas.'
        }
    ],

    cronogramaContableMensual: [
        ['Mes 1 (Ejecutado)', 'Fase 1 y Base F2', '$ 0', '$ 250.000', '$ 1.500.000', '$ 1.750.000', '$ 1.150.000', 'Project Charter, RBAC, Plataforma de Gobernanza y Grabador IA de Entrevistas'],
        ['Mes 2 (Ejecutado)', 'Fases 3 y 4', '$ 4.500.000', '$ 250.000', '$ 1.500.000', '$ 6.250.000', '$ 1.678.571', 'Montaje Servidores/NAS + Diccionario SALUS + Pipelines ETL en producción'],
        ['Mes 3 (Ejecutado)', 'Fase 5 y Base F6', '$ 0', '$ 250.000', '$ 1.500.000', '$ 1.750.000', '$ 1.200.000', 'Motor PostgreSQL + pgvector + 5 Tableros Analíticos y Dossiers por Servicio'],
        ['SUBTOTAL EJECUTADO', 'Arquitectura 100%', '$ 4.500.000', '$ 750.000', '$ 4.500.000', '$ 9.750.000', '$ 4.028.571', '65,0% del ANR ejecutado ($ 13.778.571 inversión total acumulada)'],
        ['Mes 4 (En Curso)', 'Cierre F2 y F6', '$ 0', '$ 250.000', '$ 1.500.000', '$ 1.750.000', '$ 900.000', 'Realización de Entrevistas Semánticas por Sector y ajuste de Avatares'],
        ['Mes 5 (Programado)', 'Fase 7 (Q/A)', '$ 0', '$ 500.000', '$ 1.500.000', '$ 2.000.000', '$ 800.000', 'Pruebas UAT con médicos entrevistados, Matriz Fidelidad >95% y Ciberseguridad'],
        ['Mes 6 (Programado)', 'Fase 8 (Cierre)', '$ 0', '$ 0', '$ 1.500.000', '$ 1.500.000', '$ 700.000', 'Talleres de Ingeniería de Prompts Hospitalarios, Telemetría y Cierre Final'],
        ['TOTAL PROYECTO (6M)', '8 Fases Completas', '$ 4.500.000', '$ 1.500.000', '$ 9.000.000', '$ 15.000.000', '$ 6.428.571', 'Inversión Total: $ 21.428.571 (70% ANR + 30% Contraparte)']
    ],

    contraparteDesglose: [
        {
            concepto: '1. Licenciamiento, Conectores SQL Server SALUS y Red Interna Segura (100% Montado)',
            monto: '$ 2.178.571',
            ejecutado: '$ 2.178.571',
            detalle: 'COMPLETADO AL 100%: Adecuación de switches VLAN internos, certificados SSL, configuración de servidores, conectores de solo lectura hacia SALUS y puesta en marcha del entorno productivo.'
        },
        {
            concepto: '2. Dedicación de Jefaturas Médicas y Liderazgo de Innovación (En Etapa de Entrevistas)',
            monto: '$ 2.850.000',
            ejecutado: '$ 1.350.000',
            detalle: 'EN CURSO (47%): Ejecutadas las sesiones de definición estratégica, validación de indicadores cuantitativos y mapeo de los 5 servicios ($ 1.350.000). El saldo ($ 1.500.000) corresponde a las horas de entrevistas semánticas individuales y pruebas UAT.'
        },
        {
            concepto: '3. Material Técnico, Dossiers por Servicio y Talleres de Prompts Hospitalarios',
            monto: '$ 1.400.000',
            ejecutado: '$ 500.000',
            detalle: 'EN CURSO (36%): Ya se confeccionaron los 5 Dossiers Técnicos Oficiales y las plantillas digitales de entrevista ($ 500.000). El saldo ($ 900.000) se destina al dictado de talleres prácticos en el Mes 6.'
        }
    ],

    fasesAvanceTecnico: [
        {
            fase: 'Fase 1',
            nombre: 'Definición Estratégica, Gobernanza y Control RBAC',
            responsable: 'Líder de Innovación / Dirección General y Todo el Equipo',
            entregablesExigidos: '1) Project Charter formal firmado.\n2) Matriz General de Roles, Permisos y Accesos (RBAC) aprobada.',
            estado: '100% CUMPLIDO',
            evidenciaReal: 'Se definieron los lineamientos de Gobernanza y el esquema RBAC/RLS en la plataforma. Se estructuraron formalmente los 5 Proyectos de Datos activos (Quirófano/HDD, Guardia e Internado, UCI y Kinesiología, Epidemiología SNVS/C2 y Diagnóstico por Imágenes).'
        },
        {
            fase: 'Fase 2',
            nombre: 'Relevamiento Funcional y Entrevistas Semánticas con Sectores',
            responsable: 'Especialista Funcional en Sistema SALUS + Todo el Equipo',
            entregablesExigidos: '1) Especificación de Requerimientos de Software (ERS).\n2) Acuerdos de Alcance (SOW) y Entrevistas por sector.',
            estado: '45% EN EJECUCIÓN (INFRAESTRUCTURA 100% LISTA)',
            evidenciaReal: 'VENTAJA COMPETITIVA: Ya se construyó y desplegó en la plataforma el módulo propio de "Grabador de Relevamiento y Entrevistas con IA" (con plantillas de preguntas por servicio, grabación de audio en vivo, transcripción automática y extracción de requerimientos), junto con 53 indicadores base ya relevados. Actualmente resta completar el cronograma de entrevistas presenciales con cada referente para cerrar las actas SOW.'
        },
        {
            fase: 'Fase 3',
            nombre: 'Exploración, Ingeniería Inversa y Auditoría del Sistema SALUS',
            responsable: 'Ingeniero ETL / Analista de Datos',
            entregablesExigidos: '1) Diccionario de Datos detallado de SALUS.\n2) Reporte Técnico de Diagnóstico de Calidad de Datos Hospitalarios.',
            estado: '100% CUMPLIDO (ADELANTADO)',
            evidenciaReal: 'Ingeniería inversa completa del modelo relacional SALUS: mapeo y perfilado de VLISE_Visitas, TABLEAU_Admisiones, TABLEAU_Quirofano, TurnosQuirurgicos, TABLEAU_Cirugias, TABLEAU_Diagnosticos, SER_HojaTransfusional y PR InstRespEntrada. Emisión de los 5 Dossiers Oficiales de Calidad de Datos por servicio.'
        },
        {
            fase: 'Fase 4',
            nombre: 'Canalización de Datos (Pipelines ETL SQL Server y Servidor NAS)',
            responsable: 'Ingeniero ETL / Analista de Datos',
            entregablesExigidos: '1) Repositorio de Scripts SQL documentados.\n2) Pipeline de ingesta y sincronización automatizado hacia NAS/staging.',
            estado: '100% CUMPLIDO (ADELANTADO)',
            evidenciaReal: 'Montaje completo del almacenamiento e implementación de más de 40 scripts T-SQL optimizados con directivas WITH (NOLOCK) para no degradar SALUS. Los pipelines ya sincronizan datos reales 2022-2026 y cada consulta SQL está documentada en el visor interactivo del sistema.'
        },
        {
            fase: 'Fase 5',
            nombre: 'Base de Datos PostgreSQL, Vectorización y Almacenamiento Semántico',
            responsable: 'Analista de Datos / Desarrollador Full Stack',
            entregablesExigidos: '1) Base de datos PostgreSQL con pgvector configurada.\n2) Algoritmos de preprocesamiento, chunking y vectorización.',
            estado: '90% MONTADO (LISTO PARA ENTREVISTAS)',
            evidenciaReal: 'El motor PostgreSQL, las tablas relacionales de los 5 servicios y la arquitectura vectorial pgvector ya están desplegados y cargados con los diccionarios técnicos e indicadores cuantitativos. A medida que se realicen las entrevistas de la Fase 2, sus transcripciones y reglas de negocio se vectorizan automáticamente en esta infraestructura.'
        },
        {
            fase: 'Fase 6',
            nombre: 'Desarrollo de Plataforma UI/UX, Tableros Analíticos y Agentes IA',
            responsable: 'Desarrollador Full Stack + Analista de Datos',
            entregablesExigidos: '1) Código fuente consolidado (Backend + Frontend React).\n2) Interfaz Web con Avatares Sectoriales y Tableros de Control nativos.',
            estado: '80% ARQUITECTURA EN PRODUCCIÓN',
            evidenciaReal: 'La aplicación web React + Vite, los 5 Tableros Analíticos interactivos conectados a SALUS y el motor base de Agentes (Beto IA, Copiloto de Epicrisis y Asistente de Entrevistas) ya están desarrollados y funcionando. El 20% restante consiste en personalizar las intenciones de respuesta de cada Avatar con los insumos surgidos de las entrevistas.'
        },
        {
            fase: 'Fase 7',
            nombre: 'Control de Calidad (Quality Assurance - Q/A) y Validación con Usuarios',
            responsable: 'Ingeniero de Quality Assurance (Q/A)',
            entregablesExigidos: '1) Reporte de Cobertura y Compilación.\n2) Matriz de Validación RAG certificada (> 95%).\n3) Pruebas UAT con personal médico.',
            estado: '25% VALIDACIÓN TÉCNICA BASE',
            evidenciaReal: 'La compilación continua del ecosistema (4.791 módulos) y la exactitud matemática de los tableros contra SALUS ya fueron auditadas sin errores. Las pruebas de aceptación de usuario (UAT) y la certificación final del RAG se ejecutarán en el Mes 5 tras finalizar las entrevistas.'
        },
        {
            fase: 'Fase 8',
            nombre: 'Despliegue Final, Capacitación en Prompts y Gestión del Cambio',
            responsable: 'Todo el Equipo del Proyecto',
            entregablesExigidos: '1) Plataforma de IA activa en red interna.\n2) Manuales de Uso y Talleres de Prompts Hospitalarios.\n3) Módulo de Auditoría de logs.',
            estado: '20% PREPARACIÓN (MES 6)',
            evidenciaReal: 'Ya se generaron los 5 Dossiers PDF Institucionales como material base de referencia por servicio. El dictado de los talleres presenciales de "Ingeniería de Prompts Hospitalarios" se realizará en el Mes 6 de cierre.'
        }
    ],

    transformacionMadurez: [
        {
            dimension: '1. Infraestructura y Fuente Única de Verdad',
            lineaBaseFeb2026: 'Avanzado con brecha de integración ("islas de datos" y consolidación manual en planillas Excel).',
            metaComprometida: 'Consolidar arquitectura integrada conectada a SALUS y almacenamiento local seguro.',
            logroOctubre2026: '100% MONTADO: Servidores, pipelines ETL sobre SALUS (NOLOCK) y base PostgreSQL activos para los 5 servicios.'
        },
        {
            dimension: '2. Relevamiento Semántico y Gestión del Conocimiento',
            lineaBaseFeb2026: 'Dependencia de conocimiento individual no sistematizado en referentes clave.',
            metaComprometida: 'Relevar mediante entrevistas las necesidades de cada sector para entrenar los asistentes.',
            logroOctubre2026: 'EN EJECUCIÓN CON HERRAMIENTA PROPIA: Módulo Grabador IA con transcripción y plantillas listas para ejecutar las entrevistas.'
        },
        {
            dimension: '3. Tableros Analíticos ("Menos es Más")',
            lineaBaseFeb2026: 'Sistematización aislada por departamento sin visión transversal en tiempo real.',
            metaComprometida: 'Definir un núcleo estratégico de indicadores confiables para los 3 sectores piloto.',
            logroOctubre2026: 'SUPERADO EN INFRAESTRUCTURA: 5 Macro-Servicios con tableros interactivos y 53 indicadores ya conectados a datos reales.'
        },
        {
            dimension: '4. Adopción de IA y Asistentes Sectoriales',
            lineaBaseFeb2026: 'Nivel Asistencial / "IA como Alivio" (uso puntual para tareas aisladas).',
            metaComprometida: 'Orquestar arquitectura RAG y avatares sectoriales validados por los médicos.',
            logroOctubre2026: 'MOTOR RAG Y UI LISTOS: Arquitectura de agentes montada, en etapa de ajuste fino a partir de las entrevistas de campo.'
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
    doc.text(sanitizePdfText(rightBadgeSub || 'Anexo I - 2026  |  Avance de Ejecucion'), pageWidth - margin, 19.5, { align: 'right' });

    doc.setFontSize(7.2);
    doc.setTextColor(203, 213, 225);
    doc.text('Infraestructura 100% Montada  |  Etapa Entrevistas', pageWidth - margin, 25.5, { align: 'right' });
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

    // ─── PÁGINA 1: PORTADA EJECUTIVA, RESUMEN DE ESTADO REAL Y DIAGNÓSTICO DE MADUREZ ───
    drawInstitutionalHeader(doc, pageWidth, margin, logoBase64, 'INFORME TECNICO Y CONTABLE', 'Anexo I - 2026  |  Avance Intermedio Certificado');
    let y = 41;

    // Caja de Identificación Oficial del Expediente
    doc.setFillColor(...COLORS.lightBg);
    doc.setDrawColor(...COLORS.border);
    doc.setLineWidth(0.35);
    doc.roundedRect(margin, y, contentWidth, 44, 2.5, 2.5, 'FD');

    doc.setFillColor(...COLORS.accentBlue);
    doc.roundedRect(margin, y, 3.5, 44, 1.2, 1.2, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...COLORS.accentBlue);
    doc.text('MEMORIA TECNICA Y RENDICION CONTABLE DE AVANCE — ECONOMIA DEL CONOCIMIENTO (SAN JUAN)', margin + 7, y + 5.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.2);
    doc.setTextColor(...COLORS.navy);
    const titleLines = doc.splitTextToSize(d.tituloProyecto, contentWidth - 12);
    doc.text(titleLines, margin + 7, y + 10.8);

    const metaY = y + 10.8 + titleLines.length * 4.3 + 1;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...COLORS.slateText);
    doc.text(`Empresa Beneficiaria: ${d.razonSocial}   |   Area Ejecutora: ${d.areaEjecutora}`, margin + 7, metaY);
    doc.text(`Representante Legal Firmante: ${d.representanteLegal}   |   Postulacion: ${d.fechaPostulacion}`, margin + 7, metaY + 4.3);
    doc.text(`Diagnostico Base: ${d.fechaDiagnósticoBase}`, margin + 7, metaY + 8.6);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.4);
    doc.setTextColor(...COLORS.emerald);
    const estLines = doc.splitTextToSize(
        'ESTADO ACTUAL: 100% de la Arquitectura, Infraestructura Fisica/NAS, Pipelines ETL SALUS, Base PostgreSQL, 5 Tableros Analiticos y Grabador IA de Entrevistas ya montados. Etapa actual: Ejecucion de entrevistas de campo con los referentes de cada servicio.',
        contentWidth - 12
    );
    doc.text(estLines, margin + 7, metaY + 13.2);

    y += 48;

    // 4 Tarjetas KPI de Síntesis Técnico-Contable Realista
    const kpis = [
        { label: 'ARQUITECTURA E INFRAESTRUCTURA', value: '100% MONTADA', sub: 'Servidores, ETL SALUS, BD y UI activas', color: COLORS.emerald },
        { label: 'AVANCE FISICO GLOBAL', value: '62,5% (En Curso)', sub: 'En etapa de Entrevistas por Servicio', color: COLORS.navy },
        { label: 'EJECUCION SUBSIDIO ANR', value: '$ 9.750.000', sub: '65,0% de $ 15.000.000 (Resta $ 5,25M)', color: COLORS.accentBlue },
        { label: 'INVERSION TOTAL ACUMULADA', value: '$ 13.778.571', sub: '64,3% sobre $ 21.428.571 aprobados', color: COLORS.amber }
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
        doc.setFontSize(6.2);
        doc.setTextColor(...COLORS.slateMuted);
        doc.text(k.label, cx + 3, y + 6.5);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(...COLORS.navy);
        doc.text(k.value, cx + 3, y + 12.8);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.4);
        doc.setTextColor(...COLORS.slateText);
        doc.text(k.sub, cx + 3, y + 17.8);
    });

    y += cardH + 5;

    // SECCIÓN 1: EVOLUCIÓN RESPECTO AL DIAGNÓSTICO DE MADUREZ DIGITAL (FEB 2026)
    y = drawSectionBanner(
        doc,
        y,
        margin,
        contentWidth,
        '1',
        'RESPUESTA AL DIAGNOSTICO DE MADUREZ DIGITAL (DIRECCION DE ECONOMIA DEL CONOCIMIENTO)',
        'Como la infraestructura ya montada resuelve las brechas detectadas el 21/02/2026 y habilita la etapa actual de entrevistas'
    );

    autoTable(doc, {
        startY: y,
        head: [['Dimension Evaluada (Gob. San Juan)', 'Linea de Base (21/02/2026)', 'Meta Comprometida (Anexo I)', 'Estado Actual Demostrado']],
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
            fontSize: 7.4,
            fontStyle: 'bold',
            cellPadding: 2.3
        },
        bodyStyles: {
            fontSize: 7,
            textColor: COLORS.slateText,
            cellPadding: 2.1,
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

    y = doc.lastAutoTable.finalY + 5;

    // Cumplimiento de los 6 Objetivos SMART (Tabla página 2 del Anexo I)
    y = ensureSpace(y, 65, 'AVANCE TECNICO POR OBJETIVO SMART');
    y = drawSectionBanner(
        doc,
        y,
        margin,
        contentWidth,
        '2',
        'ESTADO DE AVANCE DE LOS 6 OBJETIVOS ESPECIFICOS SMART (ANEXO I - PAGINA 2)',
        'Distincion transparente entre la arquitectura tecnologica (100% montada) y las actividades de campo en curso'
    );

    const smartRows = [
        [
            'Objetivo SMART 1',
            'Mes 1',
            'Desarrollar una matriz general de control de accesos basados en roles (RBAC) y un Documento de Gobernanza.',
            '85% EN CURSO (ARQ. 100% LISTA)',
            'Esquema RBAC/RLS y los 5 Dossiers de Gobernanza ya estan creados. En etapa de recoleccion de firmas finales durante las entrevistas con jefaturas.'
        ],
        [
            'Objetivo SMART 2',
            'Mes 2',
            'Implementar los pipelines de extraccion automatizada de datos (ETL) hacia un Servidor NAS local con disponibilidad del 99,9%.',
            '100% CUMPLIDO (MONTADO)',
            'Infraestructura de servidores/NAS e ingesta automatizada desde SALUS SQL Server (WITH NOLOCK) 100% operativa con mas de 40 consultas SQL.'
        ],
        [
            'Objetivo SMART 3',
            'Mes 3',
            'Desplegar un motor de base de datos vectorial basado en PostgreSQL y pgvector para indexar los documentos.',
            '90% MONTADO Y OPERATIVO',
            'Motor PostgreSQL + pgvector activo con los datos estructurados y diccionarios de los 5 servicios; listo para indexar las entrevistas de campo.'
        ],
        [
            'Objetivo SMART 4',
            'Mes 4',
            'Integrar el backend del sistema RAG con una interfaz UI/UX multi-agente y avatares para cada sector.',
            '80% PLATAFORMA MONTADA',
            'Frontend React + Vite, Grabador IA de Entrevistas, Agente Beto IA, Copiloto HC y 5 Tableros Analiticos ya operativos. Resta ajustar prompts tras entrevistas.'
        ],
        [
            'Objetivo SMART 5',
            'Mes 5',
            'Certificar mediante auditorias Q/A una tasa de fidelidad al contexto e inexistencia de alucinaciones > 95%.',
            '25% VALIDACION BASE',
            'Datos cuantitativos validados al 100% contra SALUS. La auditoria Q/A conversacional se ejecutara al concluir la carga de entrevistas.'
        ],
        [
            'Objetivo SMART 6',
            'Mes 6',
            'Capacitar al 100% del personal asignado en el uso de la plataforma y "Ingenieria de Prompts Hospitalarios".',
            '20% MATERIAL PREPARADO',
            '5 Dossiers PDF Oficiales por servicio ya emitidos. Los talleres presenciales se dictaran en el Mes 6 posterior a las entrevistas.'
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
            fontSize: 7.3,
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
            0: { cellWidth: 22, fontStyle: 'bold', textColor: COLORS.navy },
            1: { cellWidth: 12, halign: 'center', fontStyle: 'bold' },
            2: { cellWidth: 54 },
            3: { cellWidth: 29, halign: 'center', fontStyle: 'bold', textColor: COLORS.accentBlue },
            4: { cellWidth: contentWidth - 117 }
        }
    });

    // ─── PÁGINA 2: AUDITORÍA TÉCNICA DE LAS 8 FASES Y ENTREGABLES ───
    doc.addPage();
    drawInstitutionalHeader(doc, pageWidth, margin, logoBase64, 'MEMORIA TECNICA — 8 FASES', 'Anexo I - Paginas 3 y 7 a 11  |  Arquitectura Montada vs. Entrevistas');
    y = 41;

    y = drawSectionBanner(
        doc,
        y,
        margin,
        contentWidth,
        '3',
        'ESTADO DETALLADO DE LAS 8 FASES DEL PLAN TECNICO (ANEXO I - PAGINAS 3 Y 7 A 11)',
        'Adelanto estrategico de las Fases 3, 4, 5 y 6 (Infraestructura y Tableros listos) para potenciar la Fase 2 (Entrevistas con Sectores)'
    );

    autoTable(doc, {
        startY: y,
        head: [['Fase', 'Actividad y Perfil Responsable', 'Entregables Exigidos (Anexo I)', 'Estado Real', 'Demostracion Tecnica de lo Montado y Proximos Pasos']],
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
            cellPadding: 2.2
        },
        bodyStyles: {
            fontSize: 6.75,
            textColor: COLORS.slateText,
            cellPadding: 2,
            lineColor: COLORS.border,
            lineWidth: 0.2
        },
        alternateRowStyles: {
            fillColor: COLORS.lightBg
        },
        didParseCell: (data) => {
            if (data.section === 'body' && data.column.index === 3) {
                const txt = String(data.cell.raw || '');
                if (txt.includes('100%') || txt.includes('90%') || txt.includes('80%')) {
                    data.cell.styles.textColor = COLORS.emerald;
                } else {
                    data.cell.styles.textColor = COLORS.amber;
                }
            }
        },
        columnStyles: {
            0: { cellWidth: 16, fontStyle: 'bold', textColor: COLORS.navy },
            1: { cellWidth: 36, fontStyle: 'bold' },
            2: { cellWidth: 40 },
            3: { cellWidth: 26, halign: 'center', fontStyle: 'bold' },
            4: { cellWidth: contentWidth - 118 }
        }
    });

    y = doc.lastAutoTable.finalY + 5;

    // Resumen de la Infraestructura Montada por Servicio para Realizar las Entrevistas
    y = ensureSpace(y, 56, 'INFRAESTRUCTURA POR SERVICIO');
    y = drawSectionBanner(
        doc,
        y,
        margin,
        contentWidth,
        '4',
        'INFRAESTRUCTURA DE DATOS Y GRABADOR IA YA MONTADOS EN LOS 5 SERVICIOS',
        'Base cuantitativa real extraida de SALUS sobre la cual se apoyan las entrevistas de relevamiento con cada jefatura'
    );

    const serviciosImpactoRows = [
        [
            '1. Direccion Medica, Quirofano Central y Hospital de Dia',
            'Infraestructura y Tablero 100% Montados',
            '713 cirugias/mes (575 Qx Central + 114 HDD + 24 Partos)',
            'Entrevistas en agenda con Direccion Medica y Jefatura de Quirofano utilizando el tablero en vivo de suspensiones (2,33%), bloques y hemovigilancia.'
        ],
        [
            '2. Jefatura de Kinesiologia y Cuidados Criticos (UCI)',
            'Infraestructura y Tablero 100% Montados',
            '16 camas criticas (8 UTI + 8 Intermedios) | ALOS 4,67 d',
            'Panel de Kinesiologia Critica Respiratoria/Motora, ocupacion dual y auditoria de mortalidad ya operativo para las sesiones de entrevista con el servicio.'
        ],
        [
            '3. Coordinacion de Guardia Clinica y Seguimiento Internado',
            'Infraestructura y Tablero 100% Montados',
            '1.830 consultas/mes + 1.862 admisiones + 3.233 IC',
            'Triage Protocolo 621, curva de espera puerta-medico, conversion quirurgica <=48h y plantilla de entrevista lista para relevamiento con Coordinacion.'
        ],
        [
            '4. Vigilancia Epidemiologica (SNVS / C2) y Neurocirugia',
            'Infraestructura y Tablero 100% Montados',
            '2.920 notificaciones anuales SNVS + Neurocirugia',
            'Automatizacion de Planilla C2 (Bronquiolitis <24m, ETI, Neumonias, Diarreas, Varicela, ETS) montada y lista para validacion en entrevista con el Dr. Romano.'
        ],
        [
            '5. Diagnostico por Imagenes (DxI)',
            'Infraestructura y Tablero 100% Montados',
            '7.438 estudios efectivos/mes (Eco, Rx, Mamo, TC, DMO)',
            'Filtro anti-duplicacion de contrastes en TC, SLA de informantes y productividad por realizador montados para las entrevistas con referentes del servicio.'
        ]
    ];

    autoTable(doc, {
        startY: y,
        head: [['Servicio Hospitalario', 'Estado de Arquitectura Tecnica', 'Volumen Conectado (SALUS)', 'Articulacion con la Etapa Actual de Entrevistas']],
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
            0: { cellWidth: 40, fontStyle: 'bold', textColor: COLORS.navy },
            1: { cellWidth: 32, fontStyle: 'bold', textColor: COLORS.emerald },
            2: { cellWidth: 36, fontStyle: 'bold' },
            3: { cellWidth: contentWidth - 108 }
        }
    });

    // ─── PÁGINA 3: RENDICIÓN CONTABLE Y FINANCIERA DETALLADA (ANEXO I - PÁGINAS 4 Y 5) ───
    doc.addPage();
    drawInstitutionalHeader(doc, pageWidth, margin, logoBase64, 'RENDICION CONTABLE Y FINANCIERA', 'Anexo I - Paginas 4 y 5  |  65,0% ANR Ejecutado (Infraestructura 100%)');
    y = 41;

    y = drawSectionBanner(
        doc,
        y,
        margin,
        contentWidth,
        '5',
        'ESTADO DE EJECUCION PRESUPUESTARIA Y FINANCIAMIENTO CONSOLIDADO ($ 21.428.571)',
        'Corte Contable Intermedio: 100% del equipamiento e infraestructura ejecutados; 35% de saldo reservado para entrevistas, Q/A y cierre'
    );

    autoTable(doc, {
        startY: y,
        head: [['Concepto General Financiero', 'Monto Aprobado ($)', 'Participacion', 'Ejecutado a la Fecha ($)', '% Ejec.', 'Saldo por Ejecutar ($)', 'Estado Contable']],
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
            fontSize: 7.1,
            textColor: COLORS.slateText,
            cellPadding: 2.2,
            lineColor: COLORS.border,
            lineWidth: 0.2
        },
        columnStyles: {
            0: { cellWidth: 50, fontStyle: 'bold', textColor: COLORS.navy },
            1: { cellWidth: 25, halign: 'right', fontStyle: 'bold' },
            2: { cellWidth: 16, halign: 'center' },
            3: { cellWidth: 26, halign: 'right', fontStyle: 'bold', textColor: COLORS.emerald },
            4: { cellWidth: 13, halign: 'center', fontStyle: 'bold' },
            5: { cellWidth: 24, halign: 'right', fontStyle: 'bold', textColor: COLORS.accentBlue },
            6: { cellWidth: contentWidth - 154 }
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
        'Bienes de Capital ejecutados al 100% ($ 4.500.000); Consultoria al 50% ($ 750.000) y Recursos Humanos al 50% ($ 4.500.000)'
    );

    autoTable(doc, {
        startY: y,
        head: [['Rubro Elegible ANR', 'Tope Maximo Permitido', 'Monto Asignado', 'Ejecutado Actual', 'Saldo Disponible', '% Avance', 'Imputacion Contable y Estado de Obra']],
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
            fontSize: 6.85,
            textColor: COLORS.slateText,
            cellPadding: 2.1,
            lineColor: COLORS.border,
            lineWidth: 0.2
        },
        alternateRowStyles: {
            fillColor: COLORS.lightBg
        },
        columnStyles: {
            0: { cellWidth: 27, fontStyle: 'bold', textColor: COLORS.navy },
            1: { cellWidth: 25 },
            2: { cellWidth: 21, halign: 'right', fontStyle: 'bold' },
            3: { cellWidth: 21, halign: 'right', fontStyle: 'bold', textColor: COLORS.emerald },
            4: { cellWidth: 20, halign: 'right', fontStyle: 'bold', textColor: COLORS.accentBlue },
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
        '3 Perfiles Tecnicos Full-Time x 6 Meses x $ 500.000/mes (3 meses ejecutados en montaje de arquitectura | 3 meses para entrevistas y cierre)'
    );

    autoTable(doc, {
        startY: y,
        head: [['Rol Tecnico / Perfil', 'Dedicacion', 'Honorario / Mes', 'Total Rubro (6m)', 'Devengado (3m)', 'Saldo Restante (3m)', 'Tareas Ejecutadas vs. Tareas en Etapa de Entrevistas']],
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
            fontSize: 6.85,
            textColor: COLORS.slateText,
            cellPadding: 2.1,
            lineColor: COLORS.border,
            lineWidth: 0.2
        },
        columnStyles: {
            0: { cellWidth: 25, fontStyle: 'bold', textColor: COLORS.navy },
            1: { cellWidth: 19, halign: 'center' },
            2: { cellWidth: 18, halign: 'right' },
            3: { cellWidth: 20, halign: 'right', fontStyle: 'bold' },
            4: { cellWidth: 22, halign: 'right', fontStyle: 'bold', textColor: COLORS.emerald },
            5: { cellWidth: 22, halign: 'right', fontStyle: 'bold', textColor: COLORS.accentBlue },
            6: { cellWidth: contentWidth - 126 }
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
        'Articulacion entre los meses ya ejecutados (Montaje de Infraestructura Total) y los meses de Entrevistas, Q/A y Capacitacion'
    );

    autoTable(doc, {
        startY: y,
        head: [['Periodo / Etapa', 'Fases', 'Bienes Cap. (ANR)', 'Consultoria (ANR)', 'RR.HH. (ANR)', 'Subtotal ANR', 'Contraparte SA', 'Hito Tecnico / Estado de Ejecucion']],
        body: d.cronogramaContableMensual,
        theme: 'grid',
        margin: { left: margin, right: margin },
        headStyles: {
            fillColor: COLORS.navy,
            textColor: COLORS.white,
            fontSize: 6.9,
            fontStyle: 'bold',
            cellPadding: 2
        },
        bodyStyles: {
            fontSize: 6.75,
            textColor: COLORS.slateText,
            cellPadding: 1.9,
            lineColor: COLORS.border,
            lineWidth: 0.2
        },
        alternateRowStyles: {
            fillColor: COLORS.lightBg
        },
        didParseCell: (data) => {
            if (data.section === 'body' && (data.row.index === 3 || data.row.index === d.cronogramaContableMensual.length - 1)) {
                data.cell.styles.fontStyle = 'bold';
                data.cell.styles.fillColor = data.row.index === 3 ? COLORS.softGreenBg : COLORS.softBlueBg;
                data.cell.styles.textColor = COLORS.navy;
            }
        },
        columnStyles: {
            0: { cellWidth: 28, fontStyle: 'bold' },
            1: { cellWidth: 18, halign: 'center' },
            2: { cellWidth: 19, halign: 'right' },
            3: { cellWidth: 19, halign: 'right' },
            4: { cellWidth: 19, halign: 'right' },
            5: { cellWidth: 20, halign: 'right', fontStyle: 'bold', textColor: COLORS.navy },
            6: { cellWidth: 19, halign: 'right' },
            7: { cellWidth: contentWidth - 142 }
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
        '100% de la red, servidores y conectores SALUS ya integrados ($ 4.028.571); resta imputacion de horas de entrevistas y talleres ($ 2.400.000)'
    );

    autoTable(doc, {
        startY: y,
        head: [['Concepto de Contraparte Institucional', 'Presupuesto ($)', 'Ejecutado Actual ($)', 'Detalle Tecnico-Contable de Afectacion']],
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
    doc.setFontSize(8.1);
    doc.setTextColor(...COLORS.emerald);
    doc.text('CONCLUSIONES DEL CORTE INTERMEDIO Y CARACTER DE DECLARACION JURADA (ANEXO I - PUNTO 7)', margin + 4, y + 5.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(...COLORS.slateText);
    const ddjjText = 'Sanatorio Argentino certifica que el 100% de la infraestructura fisica y logica comprometida (Servidores/NAS, pipelines ETL sobre SALUS SQL Server, base vectorial PostgreSQL + pgvector, Grabador IA de Entrevistas y los 5 Tableros Analiticos por Servicio) ya se encuentra montada y operativa. El proyecto transita actualmente la etapa de ejecucion de entrevistas de relevamiento con los referentes de cada sector, contando con toda la plataforma lista para procesar dichas entrevistas sin riesgo tecnologico ni demoras de infraestructura.';
    const ddjjLines = doc.splitTextToSize(ddjjText, contentWidth - 8);
    doc.text(ddjjLines, margin + 4, y + 10.5);

    // Bloque de Firmas Oficiales
    const sigY = y + 43;
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
