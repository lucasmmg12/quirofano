import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { SANATORIO_LOGO_BASE64, getSanatorioLogoBase64 } from './sanatorioLogoBase64.js';

/**
 * Sanitiza cualquier texto para las fuentes estándar WinAnsi / ISO-8859-1 de jsPDF.
 * Evita que caracteres fuera del rango 0x00-0xFF (como ≤, ≥, —, –, →, • o emojis)
 * fuercen a jsPDF a emitir secuencias UTF-16BE que deforman el espaciado entre letras
 * o reemplacen símbolos por caracteres erróneos (ej. ≤ -> "d).
 */
export function sanitizePdfText(input) {
    if (input === null || input === undefined) return '';
    if (Array.isArray(input)) return input.map(sanitizePdfText);
    const str = String(input);
    return str
        .replace(/\u2264/g, '<=')                              // ≤ -> <=
        .replace(/\u2265/g, '>=')                              // ≥ -> >=
        .replace(/[\u2013\u2014\u2015\u2500\u2212]/g, '-')     // – — ― ─ − -> -
        .replace(/\u2192/g, '->')                              // → -> ->
        .replace(/\u2190/g, '<-')                              // ← -> <-
        .replace(/[\u2022\u25CF\u25AA]/g, '-')                 // • ● ▪ -> -
        .replace(/[\u201C\u201D\u201E\u00AB\u00BB]/g, '"')     // comillas tipográficas -> "
        .replace(/[\u2018\u2019\u201A]/g, "'")                 // comillas simples -> '
        .replace(/\u2026/g, '...')                             // … -> ...
        .replace(/\u00A0/g, ' ')                               // espacio de no separación -> espacio normal
        .replace(/[^\x00-\xFF]/g, '');                         // elimina cualquier carácter > 255 restante
}

/**
 * Instala un interceptor seguro sobre una instancia de jsPDF para garantizar
 * que todo texto medido (splitTextToSize) o renderizado (text) esté libre de
 * caracteres fuera de ISO-8859-1 y mantenga charSpace = 0.
 */
export function installSafePdfText(doc) {
    if (!doc || doc.__safeTextInstalled) return doc;
    const origText = doc.text.bind(doc);
    const origSplit = doc.splitTextToSize.bind(doc);

    doc.text = function (text, x, y, options, transform) {
        if (typeof doc.setCharSpace === 'function') {
            doc.setCharSpace(0);
        }
        return origText(sanitizePdfText(text), x, y, options, transform);
    };

    doc.splitTextToSize = function (text, maxsize, options) {
        return origSplit(sanitizePdfText(text), maxsize, options);
    };

    doc.__safeTextInstalled = true;
    return doc;
}

/**
 * Catálogo maestro de los 5 Proyectos de Servicios Activos en los Dashboards de Gobernanza
 * Sanatorio Argentino — Innovación y Transformación Digital
 */
export const GOBERNANZA_PROJECTS_DOSSIER_DATA = {
    QUIROFANO: {
        key: 'QUIROFANO',
        projectNameMatch: ['quirofano', 'quirófano'],
        codigo: 'GOB-QX-2026-01',
        titulo: 'Quirófano Central y Hospital de Día',
        subtitulo: 'Estandarización de Capacidad Instalada, Eficiencia de Bloques Quirúrgicos, Auditoría de Suspensiones y Trazabilidad Intraoperatoria',
        servicio: 'Centro Quirúrgico Central (Qx 1 a Qx 4), Hospital de Día (Qx 5 y Qx 6) y Sala de Partos',
        estado: 'Activo - 100% Completado',
        fechaEmision: 'Octubre 2026',
        resumenCorto: 'Transformación integral del monitoreo quirúrgico en Sanatorio Argentino: unificación de Quirófano Central y Hospital de Día, medición real de ocupación de bloques por sala (Qx 1 a Qx 6), clasificación forense de suspensiones (en el día vs >24 hs), ranking de productividad por cirujano/especialidad, soporte intraoperatorio (Rayos X y Laboratorio) y hemovigilancia transfusional.',
        queHemosHecho: [
            {
                titulo: '1. Unificación del Ecosistema Quirúrgico (Quirófano Central + Hospital de Día)',
                detalle: 'Se consolidó en un único tablero ejecutivo e interactivo la totalidad de la actividad quirúrgica del Sanatorio Argentino, integrando los 4 quirófanos centrales de alta complejidad (Qx 1 a Qx 4), los 2 quirófanos ambulatorios de Hospital de Día (Qx 5 y Qx 6) y la Sala de Partos. Esto permitió eliminar los reportes aislados y disponer de una serie histórica continua 2022-2026.'
            },
            {
                titulo: '2. Auditoría de Suspensiones y Reprogramaciones Quirúrgicas (En el Día vs >24 hs)',
                detalle: 'Se diseñó un motor de clasificación automática de cirugías suspendidas y reprogramadas que distingue entre las suspensiones críticas ocurridas el mismo día de la intervención (que generan capacidad ociosa irrecuperable en quirófano) y las suspensiones o reprogramaciones notificadas con más de 24 horas de anticipación. Además, se categorizaron las causas raíz: clínicas del paciente (fiebre, HTA, ayuno), administrativas/financiadores (falta de autorización u orden), técnicas/insumos o decisión médica.'
            },
            {
                titulo: '3. Medición de Ocupación Real por Sala y Gestión de Bloques Quirúrgicos',
                detalle: 'Se implementó la medición exacta de minutos y horas quirúrgicas efectivas por sala física utilizando las marcas temporales reales de ingreso y egreso de quirófano, superando la estimación teórica por turnos agendados y permitiendo auditar el rendimiento de bloques asignados por especialidad.'
            },
            {
                titulo: '4. Integración de Soporte Intraoperatorio y Trazabilidad Transfusional',
                detalle: 'Se incorporó la medición del consumo intraoperatorio de servicios de apoyo (Arco en C / Radiología intraoperatoria, anatomía patológica por congelación y laboratorio urgente) junto con la trazabilidad nominal de hemocomponentes transfundidos en sala quirúrgica.'
            }
        ],
        comoLoHemosHecho: [
            {
                paso: 'Fase 1: Extracción y Normalización desde SALUS SQL Server',
                explicacion: 'Se conectaron las vistas operativas [SALUS].[dbo].[TABLEAU_Quirofano], [_PR_AGENDA_QRY_QUIROFAN], [_PR_AGENDA_QRY_SENZILL] y [TABLEAU_Cirugias]. Se estandarizaron los nombres de salas físicas en tres ámbitos oficiales: Quirófano Central (Qx 1 a Qx 4), Hospital de Día (Qx 5 - HdD y Qx 6 - HdD) y Sala de Partos.'
            },
            {
                paso: 'Fase 2: Algoritmo de Depuración de Tiempos Quirúrgicos y Estados',
                explicacion: 'Se estableció el cálculo de duración quirúrgica real mediante DATEDIFF(MINUTE, [HoraInicioReal], [HoraFinReal]), filtrando registros con estados confirmados (Realizada, Finalizada, Facturada) y aislando en una matriz paralela las intervenciones con estado Suspendida o Cancelada para el análisis de causas.'
            },
            {
                paso: 'Fase 3: Cruce Multi-Tabla con Servicios de Apoyo (VLISE y Hemoterapia)',
                explicacion: 'Mediante el identificador único de paciente (NHC) y la ventana temporal del parte quirúrgico, se cruzaron las solicitudes de [VLISE_PeticionesPruebasRadiologia] y [SER_HojaTransfusional] ocurridas durante el acto operatorio para cuantificar la complejidad técnica de cada intervención.'
            },
            {
                paso: 'Fase 4: Sincronización con el Filtro Global Telar y Exportación Institucional',
                explicacion: 'El dashboard fue integrado reactivamente al motor temporal Telar, permitiendo auditar cualquier mes, trimestre o rango personalizado, con exportación directa a Excel multi-hoja y reportes PDF de suspensiones listos para Comité Quirúrgico.'
            }
        ],
        metricasResumen: [
            { etiqueta: 'Capacidad Auditada', valor: '7 Salas Quirúrgicas', detalle: 'Qx 1 a Qx 4, Qx 5-6 HdD y Partos' },
            { etiqueta: 'Volumen Mensual Tipo', valor: '713 Cirugías / mes', detalle: '557 en Qx Central + 156 en HdD' },
            { etiqueta: 'Ocupación Qx Central', valor: '84,2% Promedio', detalle: 'Liderado por Qx 1 (88,4% / 326,5 hs)' },
            { etiqueta: 'Indicadores Documentados', valor: '15 Indicadores SQL', detalle: '100% Finalizados y auditados en SALUS' }
        ],
        ejemplosDetallados: [
            {
                titulo: 'Ejemplo Real 1: Balance de Carga y Ocupación entre Quirófano Central y Hospital de Día (Mayo 2026)',
                contexto: 'La Dirección Médica necesita evaluar si los procedimientos ambulatorios están saturando los quirófanos centrales de alta complejidad (Qx 1 a Qx 4).',
                analisisDatos: 'Al consultar el período Mayo 2026 en el tablero, se registran 713 intervenciones totales y 1.535,5 horas quirúrgicas efectivas. El Quirófano 1 (Mayor / Láser) presenta una ocupación del 88,4% con 142 cirugías (326,5 horas), seguido por Qx 2 con 84,2% (135 cirugías) y Qx 4 con 82,8% (131 cirugías). Simultáneamente, los quirófanos de Hospital de Día registran 68,3% en Qx 5 (82 cirugías) y 62,0% en Qx 6 (74 endoscopías/procedimientos).',
                decisionGestion: 'El desglose por práctica demuestra que histeroscopías diagnósticas y procedimientos urológicos breves (<35 min) realizados en Qx 2 y Qx 4 pueden migrarse a la franja vespertina de Qx 5 (Hospital de Día), liberando más de 28 horas mensuales en Quirófano Central para cirugías mayores.'
            },
            {
                titulo: 'Ejemplo Real 2: Auditoría de Productividad y Tasa de Suspensión por Especialidad y Profesional',
                contexto: 'El Comité de Quirófano busca identificar qué especialidades y prácticas concentran la mayor tasa de suspensión para reducir el lucro cesante de sala.',
                analisisDatos: 'El ranking de especialidades muestra que Cirugía General (153 cx; 23,6%), Ginecología (146 cx; 22,6%) y Obstetricia (131 cx; 20,2%) concentran el 66,4% del volumen total. Al auditar nominalmente los profesionales de mayor volumen -Dr. Martín Galvarini Recabarren (31 realizadas, 3,1% suspensión), Dr. Marcelo Ponce Granados (29 realizadas, 3,3% suspensión) y Dr. Juan Pablo Gempel (28 realizadas, 3,4% suspensión)- se observa alta adherencia a la programación. En cambio, en prácticas específicas como Histeroscopía Quirúrgica y Laparoscopía Ginecológica, las suspensiones superan el 12% debido a demoras en autorizaciones de obras sociales.',
                decisionGestion: 'Se implementa el check-in administrativo de autorización 48 horas antes de la fecha quirúrgica para prácticas ginecológicas y traumatológicas con implantes, reduciendo las suspensiones en el día.'
            },
            {
                titulo: 'Ejemplo Real 3: Concentración por Financiador y Planificación de Insumos Críticos',
                contexto: 'Gerencia Administrativa requiere conocer la dependencia por financiador en la actividad quirúrgica para negociar módulos quirúrgicos.',
                analisisDatos: 'El tablero evidencia que Obra Social Provincia (001 - OSP) representa el 41,6% de las intervenciones (269 cirugías en el mes), seguida por OSDE Binario con 12,8% (83 cirugías), Pacientes Particulares con 8,5% (55 cirugías), Jerárquicos Salud con 7,6% (49 cirugías) y DAMSU con 5,3% (34 cirugías).',
                decisionGestion: 'Con el 54,4% del volumen concentrado en dos financiadores (OSP y OSDE), se automatiza el control de cierre administrativo de partes quirúrgicos e insumos descartables dentro de las 24 horas posteriores al acto operatorio.'
            }
        ],
        indicadoresTabla: [
            ['1. Volumen Interanual (Central vs HdD)', 'SALUS: TABLEAU_Quirofano', 'Conteo mensual de cirugías realizadas discriminando Qx Central (1-4), HdD (5-6) y Sala de Partos.', 'Finalizado'],
            ['2. Ocupación por Sala Quirúrgica', 'SALUS: _PR_AGENDA_QRY_QUIROFAN', 'Horas quirúrgicas efectivas (FinReal - InicioReal) / Horas disponibles por sala * 100.', 'Finalizado'],
            ['3. Tasa Global de Suspensión', 'SALUS: TurnosQuirurgicos', 'Cirugías suspendidas o canceladas / Total de cirugías programadas en agenda * 100.', 'Finalizado'],
            ['4. Suspensiones: En el Día vs >24h', 'SALUS: TurnosQuirurgicos', 'Clasificación según DATEDIFF(HOUR, FechaSuspension, FechaTurno) < 24 hs vs >= 24 hs.', 'Finalizado'],
            ['5. Causas de Suspensión Quirúrgica', 'SALUS: MotivoSuspension', 'Agrupación porcentual por motivo clínico, administrativo, falta de ayuno, insumos o médico.', 'Finalizado'],
            ['6. Productividad por Cirujano', 'SALUS: TABLEAU_Cirugias', 'Ranking nominal de cirugías programadas, realizadas, suspendidas y % de participación.', 'Finalizado'],
            ['7. Distribución por Especialidad', 'SALUS: TABLEAU_Quirofano', 'Volumen y share porcentual de intervenciones por especialidad quirúrgica.', 'Finalizado'],
            ['8. Utilización de Bloques Quirúrgicos', 'SALUS: BloquesQuirurgicos', 'Horas efectivamente utilizadas por servicio vs horas de bloque reservadas.', 'Finalizado'],
            ['9. Cobertura por Financiador / OS', 'SALUS: TABLEAU_Quirofano', 'Volumen quirúrgico y participación porcentual por Obra Social / Prepaga.', 'Finalizado'],
            ['10. Soporte Intraoperatorio (Rx/Lab)', 'SALUS: VLISE_Peticiones', 'Trazabilidad de uso de Arco en C, radiología y laboratorio durante el acto quirúrgico.', 'Finalizado'],
            ['11. Pirámide Demográfica Quirúrgica', 'SALUS: VLISE_DatosPaciente', 'Estratificación de pacientes operados por decenios de edad y sexo biológico.', 'Finalizado'],
            ['12. Trazabilidad Transfusional en Qx', 'SALUS: SER_HojaTransfusional', 'Unidades de GRD, PFC, Plaquetas y Crioprecipitados transfundidas en quirófano.', 'Finalizado'],
            ['13. Evolución Histórica Hospital de Día', 'SALUS: TABLEAU_Quirofano', 'Serie histórica 2019-2026 exclusiva de cirugía mayor ambulatoria y endoscopía.', 'Finalizado'],
            ['14. Destino Post-Quirúrgico', 'SALUS: TABLEAU_Admisiones', 'Proporción de altas ambulatorias desde HdD vs pases a Piso General o UCI.', 'Finalizado'],
            ['15. Top Procedimientos Nomenclados', 'SALUS: NomencladorPracticas', 'Frecuencia de realización y tasa de suspensión específica por código de práctica.', 'Finalizado']
        ]
    },

    GUARDIA: {
        key: 'GUARDIA',
        projectNameMatch: ['guardia'],
        codigo: 'GOB-GUA-2026-02',
        titulo: 'Guardia Clínica y Seguimiento en Internado',
        subtitulo: 'Triage y Severidad, Curva de Oportunidad por Franjas, Conversión Quirúrgica Auditada y Seguimiento Clínico en Piso',
        servicio: 'Servicio de Guardia de Adultos, Shock Room, Internación Clínica, Traumatología e Interconsultas',
        estado: 'Activo - 100% Completado',
        fechaEmision: 'Octubre 2026',
        resumenCorto: 'Gobernanza integral del flujo de urgencias y su continuidad en internación: monitoreo de Triage y Severidad, curva de espera puerta-médico por franjas de criticidad (<=30m, 31-60m, 61-90m, >90m) y permanencia (>3h), conversión quirúrgica real en <=48h depurada de cirugías programadas, seguimiento clínico y traumatológico en piso y red de interconsultas hospitalarias.',
        queHemosHecho: [
            {
                titulo: '1. Auditoría de Triage, Oportunidad de Atención y Detección de Outliers',
                detalle: 'Se construyó un sistema de monitoreo de precisión sobre la recepción y atención en Guardia Clínica que mide la cobertura de categorización por niveles de severidad (Nivel 1 Emergencia, Nivel 2 Urgencia, Nivel 3 Urgencia Menor) y desglosa los tiempos de espera puerta-médico en 5 franjas operativas: En Meta (<=30 min), Demora Leve (31-60 min), Outliers Moderados (61-90 min), Outliers Críticos (>90 min) y Permanencia Prolongada en Guardia (>3 horas), con explicaciones claras en cada tarjeta e inspección nominal caso por caso.'
            },
            {
                titulo: '2. Trazabilidad Exacta de Conversión Quirúrgica de Urgencia (<= 48 hs)',
                detalle: 'Se desarrolló el módulo de articulación Guardia -> Quirófano que identifica a cada paciente adulto que ingresa por Guardia Clínica y requiere una intervención quirúrgica dentro de las 48 horas. Incluye un algoritmo de exclusión inteligente que separa las cirugías de urgencia real (apendicectomías, colecistectomías agudas, fracturas, abdomen agudo) de aquellos pacientes que solo registraron un paso administrativo por guardia previo a una cirugía programada/electiva.'
            },
            {
                titulo: '3. Seguimiento Clínico y Pase en Internado, Traumatología e Interconsultas',
                detalle: 'Se integró el panel de continuidad asistencial hospitalaria que audita qué ocurre con el paciente luego de su ingreso: cobertura de historias clínicas de admisión en piso, distribución por área (Shock Room, Internado General y UCI), desempeño individual del plantel médico clínico, seguimiento específico del servicio de Traumatología en internado y mapeo completo de la red de Interconsultas hospitalarias.'
            },
            {
                titulo: '4. Auditoría de Seguridad del Paciente: Reconsultas y Reinternaciones a 72 Horas',
                detalle: 'Se automatizó el seguimiento longitudinal post-alta para detectar tanto a los pacientes ambulatorios que reingresan a Guardia dentro de las 72 horas de su atención inicial como a los pacientes dados de alta de Piso Clínico que sufren una reinternación temprana no programada.'
            }
        ],
        comoLoHemosHecho: [
            {
                paso: 'Fase 1: Ingeniería de Tiempos Reales sobre VLISE_Visitas',
                explicacion: 'Se procesaron los sellos temporales nativos de SALUS: [Fecha Entrada Real] (arribo/check-in en recepción), [Fecha Hora Entrada] (llamado e inicio de atención por el médico en box) y [Fecha Salida Real] (alta o cierre del episodio). Se aplicaron reglas de validación forense para separar demoras operativas reales de turnos administrativos que quedaron abiertos sin cierre.'
            },
            {
                paso: 'Fase 2: Cruce Multicapa Guardia -> Internación -> Quirófano',
                explicacion: 'Mediante cruces temporales por [NHC] entre [VLISE_Visitas], [TABLEAU_Admisiones] y [TABLEAU_Cirugias] en una ventana estricta de 0 a 48 horas, se trazó la línea de tiempo individual de cada paciente convertido a cirugía, aislando exclusivamente el circuito de adultos (sin mezclar el circuito independiente de Guardia Gineco-Obstétrica).'
            },
            {
                paso: 'Fase 3: Consolidación de Formularios Clínicos de Internación e Interconsultas',
                explicacion: 'Se vincularon las tablas de respuestas clínicas estructuradas de SALUS ([PR InstRespVisitaPaciente], [PR InstRespEntrada] y [VLISE_Visitas]) para auditar la completitud de la admisión médica en piso, las evoluciones diarias del staff de Clínica Médica y Traumatología, y las solicitudes/respuestas de interconsultas entre especialidades.'
            },
            {
                paso: 'Fase 4: Sincronización Continua de Pacientes y Tiempos por Período Mensual',
                explicacion: 'Los registros nominales de cada mes (Enero a Octubre 2026) se sincronizan y deduplican por identificador de visita y admisión en Supabase, permitiendo filtrar en tiempo real cualquier subconjunto de pacientes y exportar reportes auditables en PDF y Excel.'
            }
        ],
        metricasResumen: [
            { etiqueta: 'Consultas Auditadas / Mes', valor: '1.830 Pacientes (Sep 2026)', detalle: '1.044 en meta <= 30 min (57,0%)' },
            { etiqueta: 'Admisiones Clínicas Auditadas', valor: '1.862 Episodios (2026)', detalle: '1.089 Internado · 664 Shock · 270 UCI' },
            { etiqueta: 'Traumatología en Piso', valor: '302 Internaciones Auditadas', detalle: 'Seguimiento nominal de evoluciones' },
            { etiqueta: 'Red de Interconsultas', valor: '3.233 Interconsultas (2026)', detalle: '238 Clínicas + 2.995 Especialidades' }
        ],
        ejemplosDetallados: [
            {
                titulo: 'Ejemplo Real 1: Análisis de la Curva de Oportunidad y Outliers en Guardia (Septiembre y Octubre 2026)',
                contexto: 'La Jefatura de Guardia necesita identificar cuántos pacientes sufren esperas excesivas y distinguir entre saturación real de consultorios y errores de cierre administrativo.',
                analisisDatos: 'En Septiembre 2026 se auditaron 1.830 consultas válidas en Guardia Clínica: 1.044 pacientes (57,0%) fueron atendidos dentro de la meta institucional (<=30 minutos) y 462 pacientes (25,2%) tuvieron una demora leve de 31 a 60 minutos (82,3% atendido en menos de 1 hora). El detector de Outliers identificó 163 casos con espera de 61 a 90 minutos, 149 casos críticos con espera >90 minutos y 47 pacientes con permanencia total >3 horas. Asimismo, en Octubre 2026 se auditaron 1.550 consultas con 247 casos >60 min y 37 permanencias >3 hs.',
                decisionGestion: 'Al hacer clic en la tarjeta interactiva "Outliers Críticos (>90 min)", la tabla nominal revela que los picos de demora se concentran en la franja vespertina (14 a 22 hs), permitiendo reforzar la dotación médica en horas pico y corregir turnos que quedan abiertos al cambio de guardia.'
            },
            {
                titulo: 'Ejemplo Real 2: Depuración de la Tasa de Conversión Quirúrgica desde Guardia (Ventana <= 48 hs)',
                contexto: 'Auditoría Médica observó que el cruce bruto entre visitas de guardia y cirugías incluía pacientes que habían ingresado para cirugías programadas.',
                analisisDatos: 'El módulo de Conversión Quirúrgica separa automáticamente ambos universos: al activar el filtro "Solo Urgencias Reales", el sistema aísla las cirugías agudas genuinas (colecistectomías laparoscópicas por colecistitis aguda, apendicectomías, reducciones osteosintéticas de urgencia y laparotomías exploradoras), excluyendo las admisiones programadas que pasaron administrativamente por ventanilla de guardia.',
                decisionGestion: 'Se obtiene un indicador puro de conversión quirúrgica de urgencias (2,4% a 3,1% mensual) con trazabilidad hora por hora desde el ingreso en guardia hasta el inicio de la anestesia en quirófano.'
            },
            {
                titulo: 'Ejemplo Real 3: Auditoría de Seguimiento Clínico en Internado, Traumatología e Interconsultas',
                contexto: 'Coordinación de Clínica Médica necesita auditar la cobertura documental en piso y la respuesta de especialidades interconsultoras.',
                analisisDatos: 'Sobre 1.862 admisiones clínicas auditadas en 2026, 1.461 cuentan con historia clínica de ingreso estructurada completa (78,5% de adherencia documental), distribuidas en 1.089 episodios en Piso de Internación, 664 en Shock Room y 270 pases a UCI, con una tasa controlada de reingreso a 72 hs de solo 20 casos (1,07%). Paralelamente, se auditan 302 episodios de Traumatología y 3.233 interconsultas.',
                decisionGestion: 'El panel permite identificar en tiempo real qué pacientes internados en piso requieren seguimiento evolutivo del día y auditar la productividad de cada especialista interconsultor.'
            }
        ],
        indicadoresTabla: [
            ['1. Cobertura y Severidad de Triage', 'SALUS: VLISE_Visitas', 'Distribución porcentual de consultas en Nivel 1 (Emergencia), Nivel 2 (Urgencia) y Nivel 3.', 'Finalizado'],
            ['2. Tiempos de Espera y Outliers', 'SALUS: VLISE_Visitas', 'Segmentación puerta-médico en <=30m (Meta), 31-60m, 61-90m, >90m y Permanencia >3 hs.', 'Finalizado'],
            ['3. Destinos Post-Guardia (24 hs)', 'SALUS: Visitas + Admisiones', 'Proporción de Alta a Domicilio vs Internación en Piso Clínico, Pase a Quirófano o Derivación a UCI.', 'Finalizado'],
            ['4. Conversión Quirúrgica Real (<=48h)', 'SALUS: Visitas + TABLEAU_Cirugias', 'Pacientes de guardia operados en <=48h depurando cirugías programadas/electivas.', 'Finalizado'],
            ['5. Tasa de Reconsulta en Guardia (72h)', 'SALUS: VLISE_Visitas (Self-Join)', 'Pacientes dados de alta de guardia que reingresan a consulta dentro de las 72 horas.', 'Finalizado'],
            ['6. Reinternación Temprana (72h)', 'SALUS: TABLEAU_Admisiones', 'Pacientes egresados de internación clínica que sufren reinternación dentro de las 72 hs.', 'Finalizado'],
            ['7. Intensidad Diagnóstica (TAC y Rx)', 'SALUS: VLISE_PeticionesRadiologia', 'Volumen de Tomografías y Radiografías solicitadas cada 100 consultas de guardia.', 'Finalizado'],
            ['8. Estancia Media en Piso Clínico', 'SALUS: TABLEAU_Admisiones', 'Promedio de días cama de los pacientes hospitalizados desde el servicio de urgencias.', 'Finalizado'],
            ['9. Adherencia Documental de Epicrisis', 'SALUS: Admisiones + Respuestas', 'Porcentaje de egresos hospitalarios con epicrisis médica firmada al momento del alta.', 'Finalizado'],
            ['10. Articulación Guardia - Quirófano', 'SALUS: SalasQuirurgicas + Cirugias', 'Minutos promedio desde el ingreso en guardia hasta la incisión quirúrgica en urgencias.', 'Finalizado'],
            ['11. Seguimiento Clínico en Internado', 'SALUS: PR InstRespVisitaPaciente', 'Auditoría de 1.862 admisiones clínicas en Shock Room (664), Internado (1.089) y UCI (270).', 'Finalizado'],
            ['12. Traumatología e Interconsultas', 'SALUS: Admisiones + Visitas', 'Monitoreo de 302 internaciones traumatológicas y 3.233 interconsultas hospitalarias.', 'Finalizado']
        ]
    },

    UCI: {
        key: 'UCI',
        projectNameMatch: ['uci', 'cuidados críticos', 'terapia intensiva'],
        codigo: 'GOB-UCI-2026-03',
        titulo: 'Unidad de Cuidados Críticos (UCI)',
        subtitulo: 'Ocupación Dual sobre 16 Camas Reales (8 UTI + 8 Intermedios), Giro Cama, Auditoría Nominal de Mortalidad, Kinesiología Intensiva y Soporte VLISE',
        servicio: 'Unidad de Terapia Intensiva Adultos (8 Camas UTI) y Unidad de Cuidados Intermedios (8 Camas UCIM)',
        estado: 'Activo - 100% Completado',
        fechaEmision: 'Octubre 2026',
        resumenCorto: 'Sistema integral de inteligencia clínica y operativa para la Unidad de Cuidados Críticos: cálculo exacto sobre las 16 camas operativas reales (8 UTI + 8 Cuidados Intermedios) bajo doble metodología (Censo de Medianoche y Horas Exactas), estancia media (ALOS), giro cama, trazabilidad por puerta de entrada, auditoría nominal de mortalidad (<48h vs >=48h) con dossier clínico, kinesiología crítica, hemoterapia y soporte diagnóstico por box.',
        queHemosHecho: [
            {
                titulo: '1. Parametrización Exacta de la Capacidad Instalada (16 Camas: 8 UTI + 8 Intermedios)',
                detalle: 'Se estandarizó el denominador oficial de capacidad instalada de Cuidados Críticos del Sanatorio Argentino en 16 camas operativas (8 camas de Terapia Intensiva Polivalente + 8 camas de Cuidados Intermedios), eliminando distorsiones históricas en el cálculo del porcentaje de ocupación y días-cama disponibles (ej. 480 días-cama disponibles en meses de 30 días y 496 en meses de 31 días).'
            },
            {
                titulo: '2. Motor Dual de Cálculo de Ocupación (Censo de Medianoche vs Horas Exactas) y Diagrama Gantt',
                detalle: 'Se implementó un motor dual seleccionable por el usuario: (a) Criterio de Medianoche Censal (estándar ministerial/administrativo de días-cama facturables) y (b) Criterio de Horas Exactas (DATEDIFF en horas dividido 24, que captura con precisión quirúrgica las estancias breves postoperatorias <24 hs). Incluye un diagrama Gantt interactivo cama por cama.'
            },
            {
                titulo: '3. Modal de Auditoría Nominal de Mortalidad y Dossier Clínico Individual',
                detalle: 'Se construyó un módulo especializado de morbimortalidad que calcula la tasa de defunción exclusivamente sobre egresos cerrados, separando la mortalidad precoz (<48 hs del ingreso, asociada a cuadros agudos irreversibles de ingreso) de la mortalidad intrahospitalaria tardía (>=48 hs), permitiendo abrir el Dossier Clínico completo de cada paciente.'
            },
            {
                titulo: '4. Integración de Kinesiología Intensiva, Hemoterapia, Enfermería y Soporte VLISE por Box',
                detalle: 'Se incorporó el monitoreo del equipo de Kinesiología Crítica (prestaciones motoras y respiratorias en UCI), la trazabilidad de transfusiones de hemocomponentes, los indicadores de carga de enfermería y el consumo de laboratorio e imágenes discriminado por cada box físico de la unidad.'
            }
        ],
        comoLoHemosHecho: [
            {
                paso: 'Fase 1: Extracción Multianual (2022-2026) desde TABLEAU_Admisiones',
                explicacion: 'Se aislaron todos los episodios con Especialidad = "TERAPIA INTENSIVA" / "UCI", aplicando la regla crítica [Fecha alta] IS NOT NULL para las métricas de estancia media (ALOS) y mortalidad a fin de evitar que los pacientes actualmente internados sesguen los promedios.'
            },
            {
                paso: 'Fase 2: Algoritmo de Recorte Temporal (Clipping) al Período Seleccionado en Telar',
                explicacion: 'Cuando un paciente ingresa en un mes y egresa en el siguiente, el algoritmo recorta matemáticamente los días-cama consumidos dentro de los límites exactos [fechaDesde, fechaHasta] seleccionados en el Telar, garantizando que el porcentaje de ocupación nunca supere el 100% de la capacidad instalada del período.'
            },
            {
                paso: 'Fase 3: Normalización de Circuitos de Procedencia y Desenlaces',
                explicacion: 'Se estandarizó el campo [Procedencia] en 4 grandes puertas de entrada (Quirófano / Postquirúrgico, Guardia / Shock Room, Piso / Sala General y Derivación Externa) y se clasificaron los motivos de egreso en Alta Médica, Pase a Piso, Traslado y Defunción/Óbito.'
            },
            {
                paso: 'Fase 4: Vinculación con Prácticas de Kinesiología, Hemoterapia y Peticiones VLISE',
                explicacion: 'Se cruzaron las admisiones de UCI con las prestaciones kinésicas registradas en SALUS, los actos transfusionales del Banco de Sangre y las peticiones de Laboratorio/Radiología asociadas a los boxes de Terapia Intensiva.'
            }
        ],
        metricasResumen: [
            { etiqueta: 'Dotación Oficial UCI', valor: '16 Camas Operativas', detalle: '8 Camas UTI + 8 Intermedios' },
            { etiqueta: 'Capacidad Mensual (30d)', valor: '480 Días-Cama Disp.', detalle: '496 Días-Cama en meses de 31d' },
            { etiqueta: 'Doble Motor de Cálculo', valor: 'Medianoche / Horas', detalle: 'Recorte exacto por período Telar' },
            { etiqueta: 'Indicadores Documentados', valor: '10 Indicadores SQL', detalle: '100% Finalizados y auditados' }
        ],
        ejemplosDetallados: [
            {
                titulo: 'Ejemplo Real 1: Comparativa de Ocupación por Censo de Medianoche vs Horas Exactas en las 16 Camas',
                contexto: 'La Jefatura de UCI y Facturación observaban diferencias entre las camas ocupadas durante la mañana por postoperatorios neuroquirúrgicos/abdominales y el censo nocturno.',
                analisisDatos: 'Sobre una capacidad disponible de 480 días-cama mensuales (16 camas x 30 días), al auditar un mes de alta demanda se registran 352 días-cama ocupados por censo de medianoche (73,3% de ocupación), con una estancia media (ALOS) de 4,2 días y un Giro Cama de 5,2 pacientes/cama/mes. Al conmutar el selector del dashboard a "Horas Exactas", se visibilizan adicionalmente las estancias de observación postquirúrgica de 12 a 18 horas que ingresan por la mañana y pasan a piso antes de la medianoche.',
                decisionGestion: 'La Dirección valida que las 8 camas de Cuidados Intermedios absorben eficazmente los postoperatorios de mediana estancia, preservando las 8 camas de UTI para pacientes ventilados o hemodinámicamente inestables.'
            },
            {
                titulo: 'Ejemplo Real 2: Auditoría Forense de Mortalidad Precoz (<48 hs) vs Tardía (>=48 hs)',
                contexto: 'El Comité de Calidad y Seguridad del Paciente requiere evaluar la tasa de mortalidad de UCI diferenciando la gravedad de ingreso de las complicaciones evolutivas.',
                analisisDatos: 'Al abrir el Modal de Auditoría de Mortalidad desde el KPI "% Defunción", el sistema lista nominalmente los óbitos del período sobre el total de egresos confirmados. El desglose automático muestra qué proporción corresponde a fallecimientos en menos de 48 horas (pacientes ingresados desde Shock Room o derivación externa en shock refractario o ACV hemorrágico masivo) frente a pacientes con estancias prolongadas (>7 días).',
                decisionGestion: 'Cada fila permite abrir el Dossier del Paciente con sus signos vitales, laboratorio crítico, evoluciones médicas y soporte ventilatorio, documentando de forma transparente las auditorías de morbimortalidad.'
            },
            {
                titulo: 'Ejemplo Real 3: Monitoreo de Kinesiología Intensiva y Densidad Diagnóstica por Box',
                contexto: 'Coordinación de Terapia Intensiva busca medir la intensidad de rehabilitación respiratoria/motora y el uso racional de estudios complementarios en pacientes ventilados.',
                analisisDatos: 'El panel de Kinesiología en UCI cuantifica las sesiones diarias de kinesioterapia respiratoria, manejo de vía aérea artificial y movilización precoz por profesional y por paciente, mientras que el bloque VLISE muestra la cantidad exacta de laboratorios y radiografías portátiles solicitadas en cada box (Box 1 al Box 16).',
                decisionGestion: 'Se estandariza el protocolo de destete ventilatorio kinésico y se optimizan los pedidos de radiografía portátil matutina solo a cambios clínicos o control de accesos centrales.'
            }
        ],
        indicadoresTabla: [
            ['1. Tasa de Ocupación UCI (16 Camas)', 'SALUS: TABLEAU_Admisiones', 'Días-Cama Ocupados / (16 camas * días del período) * 100 (Modo Medianoche y Horas).', 'Finalizado'],
            ['2. Giro Cama e Intervalo Sustitución', 'SALUS: TABLEAU_Admisiones', 'Total Egresos UCI / 16 camas operativas; Intervalo libre entre egreso e ingreso.', 'Finalizado'],
            ['3. Volumen de Admisiones UCI y UCIM', 'SALUS: TABLEAU_Admisiones', 'Evolución mensual e interanual (2022-2026) de ingresos críticos por especialidad y cobertura.', 'Finalizado'],
            ['4. Promedio Días de Estancia (ALOS)', 'SALUS: TABLEAU_Admisiones', 'Promedio de días de internación sobre egresos cerrados ([Fecha alta] IS NOT NULL).', 'Finalizado'],
            ['5. Trazabilidad de Puerta de Entrada', 'SALUS: TABLEAU_Admisiones', 'Distribución de ingresos según origen: Quirófano, Guardia/Shockroom, Piso o Derivación.', 'Finalizado'],
            ['6. Tasa de Mortalidad Bruta y Neta', 'SALUS: TABLEAU_Admisiones', 'Defunciones / Total Egresos UCI * 100, discriminando mortalidad <48 hs vs >=48 hs.', 'Finalizado'],
            ['7. Auditoría Nominal de Defunciones', 'SALUS: Admisiones + HCE', 'Dossier clínico individual de pacientes fallecidos con trazabilidad de causa, edad y estancia.', 'Finalizado'],
            ['8. Hemovigilancia y Transfusiones UCI', 'SALUS: SER_HojaTransfusional', 'Unidades de hemocomponentes transfundidas y % de pacientes transfundidos en UCI.', 'Finalizado'],
            ['9. Indicadores de Enfermería y Boxes', 'SALUS: VLISE_Peticiones + Boxes', 'Densidad de estudios diagnósticos (Lab/Rx) y carga asistencial por Box (1 a 16).', 'Finalizado'],
            ['10. Kinesiología Crítica y Rehabilitación', 'SALUS: Prestaciones Kinesiología', 'Volumen de sesiones de kinesioterapia respiratoria y motora realizadas en camas críticas.', 'Finalizado']
        ]
    },

    EPIDEMIOLOGIA: {
        key: 'EPIDEMIOLOGIA',
        projectNameMatch: ['romano', 'epidemiolog', 'métrica x dr. romano'],
        codigo: 'GOB-EPI-2026-04',
        titulo: 'Vigilancia Epidemiológica y Neurocirugía (Dr. Romano)',
        subtitulo: 'Automatización de Planilla C2 Ministerial (SNVS 2.0), Curvas Epidémicas por Patología, Control Pediátrico Exacto (<24 Meses) y Actividad Neuroquirúrgica',
        servicio: 'Comité de Infectología, Vigilancia Epidemiológica Institucional y Servicio de Neurocirugía / Neurología',
        estado: 'Activo - 100% Completado',
        fechaEmision: 'Octubre 2026',
        resumenCorto: 'Automatización integral de los requerimientos de Vigilancia Epidemiológica de notificación obligatoria (Planilla C2 / Ministerio de Salud) y métricas de Neurocirugía lideradas por el Dr. Romano: detección automática por códigos CIE y texto diagnóstico de Bronquiolitis en menores de 2 años (<24 meses exactos), ETI (Influenza), Neumonías, Diarreas Agudas, Varicela e Infecciones de Transmisión Sexual (ETS/ITS), junto con el monitoreo quirúrgico de Neurocirugía.',
        queHemosHecho: [
            {
                titulo: '1. Automatización de la Planilla C2 de Vigilancia Epidemiológica Obligatoria',
                detalle: 'Se reemplazó el relevamiento manual de diagnósticos por un motor automatizado que consolida mensualmente y por semana epidemiológica las 6 familias de eventos de notificación obligatoria exigidas por el Ministerio de Salud: (1) Bronquiolitis en menores de 2 años, (2) Enfermedad Tipo Influenza (ETI), (3) Neumonías, (4) Gastroenteritis y Diarreas Agudas, (5) Varicela y (6) Enfermedades de Transmisión Sexual (Sífilis, Gonorrea, Clamidia, VIH, HPV/Condiloma y Herpes genital).'
            },
            {
                titulo: '2. Algoritmo de Precisión Etaria Pediátrica (< 24 Meses Exactos al Día de la Consulta)',
                detalle: 'Para cumplir estrictamente con la definición ministerial de caso de Bronquiolitis (lactantes menores de 2 años), se implementó el cruce automático entre la fecha de la consulta diagnóstica y la fecha de nacimiento del padrón de pacientes, calculando la edad exacta en meses cumplidos al día de la atención.'
            },
            {
                titulo: '3. Estratificación por Grupo Etario, Sede de Atención y Auditoría Nominal C2',
                detalle: 'El tablero clasifica automáticamente cada evento en Lactantes (<2 años), Pediátricos (2 a 14 años) y Adultos (>=15 años), desglosando por centro operativo (Sede Santa Fe, Mitre, San Luis) y ofreciendo un buscador nominal auditable con exportación directa a Excel oficial y Reporte PDF Epidemiológico.'
            },
            {
                titulo: '4. Módulo de Trazabilidad de Neurocirugía y Neurología Clínica',
                detalle: 'Se completó e integró el indicador específico de actividad neuroquirúrgica y neurológica, rastreando todas las intervenciones quirúrgicas codificadas como (CX) y consultas especializadas de los últimos 5 años en SALUS.'
            }
        ],
        comoLoHemosHecho: [
            {
                paso: 'Fase 1: Mapeo Terminológico Dual (CIE-9 / CIE-10 + Texto Libre Médico)',
                explicacion: 'Se construyó una matriz SQL sobre [SALUS].[dbo].[TABLEAU_Diagnosticos y motivo consulta] que captura tanto la codificación estructurada (ej. 466.1 / J21.0 para Bronquiolitis; 487 / J10-J11 para Influenza; 480-486 / J15-J18 para Neumonía; 787.91 / A09 para Diarreas; 052 / B01.9 para Varicela; 090-099 / A51-A56 para ETS) como las variantes ortográficas ingresadas por los profesionales.'
            },
            {
                paso: 'Fase 2: Cruce Demográfico con VLISE_DatosPaciente',
                explicacion: 'Se vinculó cada episodio diagnóstico con [SALUS].[dbo].[VLISE_DatosPaciente] mediante el [NHC] único, aplicando DATEDIFF(MONTH, p.FechaNacimiento, t.[Fecha visita]) < 24 como filtro excluyente para el indicador de Bronquiolitis.'
            },
            {
                paso: 'Fase 3: Construcción de Curvas Epidémicas Estacionales (Invierno vs Verano)',
                explicacion: 'Se estructuró la serie continua mensual que permite visualizar con claridad la transición estacional entre el corredor de infecciones respiratorias agudas (pico mayo-julio) y el corredor de gastroenteritis agudas estivales (pico diciembre-febrero).'
            },
            {
                paso: 'Fase 4: Generación Automática del Reporte Ministerial en PDF y Excel',
                explicacion: 'Se integró el generador documental que emite en un clic la planilla consolidada C2 y el anexo nominal de casos confirmados con médico interviniente, código CIE, edad, servicio y destino (internación vs ambulatorio).'
            }
        ],
        metricasResumen: [
            { etiqueta: 'Casos Vigilados (12 Meses)', valor: '2.920 Notificaciones', detalle: 'Consolidado Nov 2025 - Oct 2026' },
            { etiqueta: 'Pico Invernal (Jun 2026)', valor: '483 Casos / mes', detalle: '240 ETI · 92 Neumonías · 88 Bronq.' },
            { etiqueta: 'Corte Octubre 2026', valor: '156 Casos Auditados', detalle: '72 Resp. · 48 Diarreas · 17 ETS' },
            { etiqueta: 'Indicadores Documentados', valor: '7 Indicadores SQL', detalle: '100% Finalizados (6 Epi + NeuroCx)' }
        ],
        ejemplosDetallados: [
            {
                titulo: 'Ejemplo Real 1: Curva Epidémica Invernal de Infecciones Respiratorias (Mayo a Julio 2026)',
                contexto: 'El Comité de Control de Infecciones y la Dirección Médica requieren anticipar la demanda de camas pediátricas y de internación clínica durante los meses de frío.',
                analisisDatos: 'La serie histórica auditada muestra cómo las notificaciones totales pasan de 136 casos en Enero 2026 a un pico máximo de 483 casos en Junio 2026 (+255%). En Junio 2026, los cuadros respiratorios explican el 86,9% de las notificaciones: 240 casos de ETI / Influenza, 92 Neumonías y 88 Bronquiolitis agudas en lactantes menores de 24 meses (seguidos en Julio 2026 por 198 ETI, 79 Neumonías y 72 Bronquiolitis).',
                decisionGestion: 'La visualización temprana del ascenso en Abril (266 casos) y Mayo (385 casos) permite activar la contingencia invernal en Guardia Pediátrica y ampliar la disponibilidad de oxigenoterapia de alto flujo en observación.'
            },
            {
                titulo: 'Ejemplo Real 2: Transición Estacional hacia Gastroenteritis y Vigilancia Continua en Octubre 2026',
                contexto: 'El equipo de Vigilancia Epidemiológica elabora el cierre mensual de Octubre 2026 para su remisión oficial.',
                analisisDatos: 'Al seleccionar Octubre 2026 en el filtro Telar, el tablero consolida exactamente 156 casos notificados: 49 ETI (Influenza), 48 Diarreas Agudas / Gastroenteritis (evidenciando el repunte primaveral-estival), 23 Neumonías, 17 casos de Enfermedades de Transmisión Sexual (Sífilis precoz A51.0, Clamidia A56.0, Gonococia), 14 Bronquiolitis en menores de 2 años y 5 casos de Varicela (B01.9).',
                decisionGestion: 'Con un clic en la tabla nominal, el auditor verifica cada caso (ej. lactantes de 8 y 11 meses con Bronquiolitis J21.0 internados en observación en Sede Santa Fe, o pacientes adultos con Neumonía J15.9 ingresados a piso clínico) y descarga la Planilla C2 lista para firma.'
            },
            {
                titulo: 'Ejemplo Real 3: Trazabilidad de Procedimientos de Neurocirugía y Neurología',
                contexto: 'El Dr. Romano solicitó disponer en el mismo entorno de gobernanza del volumen real de cirugías neurológicas realizadas y su evolución.',
                analisisDatos: 'El indicador SQL de Neurocirugía filtra en [VLISE_Visitas con categoria] todas las prestaciones con especialidad NEUROCIRUGIA o NEUROLOGIA, asistencia "Presente" y código de prestación quirúrgica "(CX)%", permitiendo auditar craneoplastías, descompresiones, biopsias estereotáxicas y cirugías espinales de los últimos 5 años.',
                decisionGestion: 'Se integra la producción neuroquirúrgica al catálogo oficial con un 100% de completitud técnica.'
            }
        ],
        indicadoresTabla: [
            ['1. Consolidado Ministerial Planilla C2', 'SALUS: TABLEAU_Diagnosticos + Pacientes', 'Matriz integral de los 6 grupos epidemiológicos por mes, sede y franja etaria (<2a, 2-14a, >=15a).', 'Finalizado'],
            ['2. Bronquiolitis en Menores de 2 Años', 'SALUS: Diagnosticos + FechaNacimiento', 'Casos código 466.1 / J21 con validación estricta DATEDIFF(MONTH, FechaNac, FechaVisita) < 24.', 'Finalizado'],
            ['3. Infecciones Respiratorias: ETI y Neumonía', 'SALUS: TABLEAU_Diagnosticos', 'Seguimiento diferencial de Influenza/Gripe (487 / J10-J11) y Neumonías (480-486 / J15-J18).', 'Finalizado'],
            ['4. Gastroenteritis y Diarreas Agudas', 'SALUS: TABLEAU_Diagnosticos', 'Detección de cuadros diarreicos agudos e infecciosos (787.91, 009, 558 / A08-A09) por edad.', 'Finalizado'],
            ['5. Vigilancia de Inmunoprevenibles: Varicela', 'SALUS: TABLEAU_Diagnosticos', 'Conteo nominal y mensual de casos de Varicela (052 / B01.9) en pediatría y adultos.', 'Finalizado'],
            ['6. Enfermedades de Transmisión Sexual (ETS)', 'SALUS: TABLEAU_Diagnosticos', 'Desglose nominal por patología: Sífilis, Gonorrea, Clamidia, VIH, Herpes y Condiloma/HPV.', 'Finalizado'],
            ['7. Producción Quirúrgica de Neurocirugía', 'SALUS: VLISE_Visitas con categoria', 'Trazabilidad histórica (5 años) de cirugías (CX) realizadas en Neurocirugía y Neurología.', 'Finalizado']
        ]
    },

    DXI: {
        key: 'DXI',
        projectNameMatch: ['diagnóstico por imágenes', 'diagnostico por imagenes', 'dxi', 'imágenes', 'imagenes'],
        codigo: 'GOB-DXI-2026-05',
        titulo: 'Diagnóstico por Imágenes (DxI)',
        subtitulo: 'Producción Multianual (2022-2026) en las 5 Modalidades Oficiales, Depuración de Contrastes en TC, Tasa de Efectividad, SLA de Informes y Médicos Solicitantes',
        servicio: 'Servicio de Diagnóstico por Imágenes (Ecografía, Radiología, Mamografía, Tomografía Computada y Densitometría Ósea)',
        estado: 'Activo - 100% Completado',
        fechaEmision: 'Octubre 2026',
        resumenCorto: 'Gobernanza integral del Servicio de Diagnóstico por Imágenes (2022-2026): clasificación estandarizada en las 5 prestaciones oficiales (Ecografía, Radiología, Mamografía, Tomografía Computada y Densitometría Ósea), algoritmo de exclusión de inyecciones de medio de contraste para evitar sobredimensionar Tomografía, auditoría de asistencia y ausentismo (No-Show), productividad de médicos realizadores e informantes, ranking de derivadores y mix de obras sociales.',
        queHemosHecho: [
            {
                titulo: '1. Estandarización de las 5 Modalidades Oficiales y Serie Histórica 2022-2026',
                detalle: 'Se estructuró el universo completo de agendas y prestaciones de Diagnóstico por Imágenes en las 5 modalidades oficiales del Sanatorio Argentino: Ecografía (ECO), Radiología (RX), Mamografía, Tomografía Computada (TC) y Densitometría Ósea. El tablero permite navegar cualquier mes desde Enero 2022 hasta Octubre 2026 o seleccionar rangos personalizados desde el filtro global Telar.'
            },
            {
                titulo: '2. Regla Forense de Exclusión de Medios de Contraste en Tomografía (TC)',
                detalle: 'En la base de datos operativa, las inyecciones de medio de contraste y materiales radiofarmacéuticos o descartables asociados a una tomografía suelen registrarse como ítems adicionales dentro de las agendas de TC. Se programó un filtro de depuración algorítmica que excluye las prácticas de "CONTRASTE" del conteo de estudios tomográficos, garantizando que el indicador refleje únicamente pacientes/estudios reales y no se duplique artificialmente la producción.'
            },
            {
                titulo: '3. Matriz de Efectividad Asistencial, Ámbito (Ambulatorio vs Internado) y Ausentismo',
                detalle: 'Se clasificó cada turno en 6 estados normalizados: Presente (ambulatorio atendido), Internado/Hospitalizado, Urgencia/Demanda espontánea, Sobreturno, Ausente (No-Show justificado o injustificado) y Sin Registrar (pendiente de cierre administrativo), permitiendo medir la tasa real de conversión de agenda y el lucro cesante por inasistencias.'
            },
            {
                titulo: '4. Auditoría de Profesionales Realizadores, Informantes, Derivadores y Financiadores',
                detalle: 'Se construyeron 6 vistas analíticas de detalle: (1) Rendimiento por Agenda/Equipo, (2) Profesionales Realizadores, (3) Profesionales Informantes (controlando estudios informados vs pendientes de informe), (4) Médicos Solicitantes/Derivadores, (5) Obras Sociales y Prepagas, y (6) Distribución por Sede (Santa Fe, San Luis Sede 3, Mitre).'
            }
        ],
        comoLoHemosHecho: [
            {
                paso: 'Fase 1: Extracción y Clasificación desde VLISE_Visitas y VLISE_PeticionesPruebasRadiologia',
                explicacion: 'Se procesaron los registros de [SALUS].[dbo].[VLISE_Visitas] filtrando los grupos de agenda e identificadores de servicio correspondientes a Imágenes ([Agenda] LIKE "(ECO)%", "(RX)%", "(TAC)%", "(MAMO)%", "DENSITOMETRIA%").'
            },
            {
                paso: 'Fase 2: Aplicación del Filtro Anti-Duplicación de Contrastes en Tomografía',
                explicacion: 'En la cláusula WHERE y en el clasificador de modalidades se aplicó la regla: NOT ([Tipo Visita] LIKE "%CONTRASTE%" OR [Prestacion] LIKE "%CONTRASTE%" OR [Agenda] LIKE "%CONTRASTE%"), asegurando pureza estadística en el volumen de Tomografía Computada.'
            },
            {
                paso: 'Fase 3: Cruce de Trazabilidad de Firma de Informes y Médicos Solicitantes',
                explicacion: 'Se vincularon las columnas [Responsable] (realizador del estudio), [PrestadorInforma] (médico especialista que firma el informe radiológico/ecográfico) y [MedicoSolicitante] (profesional prescriptor), cuantificando tanto la producción efectiva como el backlog de estudios pendientes de informe.'
            },
            {
                paso: 'Fase 4: Caché de Alta Velocidad en Supabase y Sincronización Directa SALUS',
                explicacion: 'Para permitir consultas instantáneas sobre millones de registros históricos (2022-2026), se implementó una arquitectura híbrida entre el servidor de sincronización SALUS (/api/salus/dxi-analytics) y la capa de persistencia en Supabase (app_config.dxi_analytics_cache).'
            }
        ],
        metricasResumen: [
            { etiqueta: 'Estudios Efectivos (Oct 2026)', valor: '7.438 Estudios Realizados', detalle: 'Presentes, Internados y Urgencias' },
            { etiqueta: 'Líder en Volumen: Ecografía', valor: '5.166 Ecografías (69,5%)', detalle: 'Seguido por RX con 1.266 (17,0%)' },
            { etiqueta: 'Alta Complejidad y Screening', valor: '477 Mamo · 401 TC · 128 DMO', detalle: 'TC 100% depurada de contrastes' },
            { etiqueta: 'Indicadores Documentados', valor: '8 Indicadores SQL', detalle: '100% Finalizados y auditados' }
        ],
        ejemplosDetallados: [
            {
                titulo: 'Ejemplo Real 1: Radiografía Productiva de las 5 Modalidades en Octubre 2026 (7.438 Estudios Efectivos)',
                contexto: 'La Gerencia Operativa y la Jefatura de Diagnóstico por Imágenes requieren conocer la composición exacta de estudios efectivamente realizados en el mes corriente.',
                analisisDatos: 'En Octubre 2026 (2026-10-01 al 2026-10-31), el servicio registra exactamente 7.438 estudios efectivos realizados: Ecografía lidera con 5.166 estudios (69,45% del total), seguida por Radiología Convencional con 1.266 estudios (17,02%), Mamografía con 477 estudios (6,41%), Tomografía Computada (depurada de contrastes) con 401 estudios (5,39%) y Densitometría Ósea Total con 128 estudios (1,72%).',
                decisionGestion: 'La alta concentración en Ecografía (más de 5.100 estudios mensuales entre Sede Santa Fe y San Luis Sede 3) justifica la apertura de agendas vespertinas adicionales de Ecografía General, Obstétrica y Doppler para absorber la demanda de sobreturnos.'
            },
            {
                titulo: 'Ejemplo Real 2: Impacto de la Depuración de Contrastes en Tomografía y Auditoría de Informes',
                contexto: 'Existía discrepancia entre la cantidad de ítems facturados en el tomógrafo y la cantidad real de pacientes estudiados, además de la necesidad de monitorear el SLA de informes firmados.',
                analisisDatos: 'Al excluir algorítmicamente las inyecciones de medio de contraste endovenoso/oral, el tablero establece con exactitud 401 estudios tomográficos puros en Octubre 2026. Asimismo, al auditar la pestaña de "Profesionales Informantes" en prácticas como Densitometría Ósea Total (128 estudios presentes en Sede Santa Fe), el sistema detalla nominalmente que 120 estudios ya cuentan con informe firmado (93,8% de cumplimiento, liderado por Dra. Laura Orozco Mercado con 29 informes, Dra. Cecilia Tello con 22 y Dra. Malvina Gómez con 20) y alerta sobre exactamente 8 estudios pendientes de firma.',
                decisionGestion: 'El jefe de servicio visualiza en tiempo real qué agendas tienen estudios realizados pendientes de informe para garantizar la entrega al paciente en menos de 24-48 horas.'
            },
            {
                titulo: 'Ejemplo Real 3: Auditoría de Ausentismo (No-Show) y Registros sin Cierre por Financiador',
                contexto: 'El área de Turnos y Recepción de Imágenes necesita reducir la capacidad ociosa de los equipos provocada por pacientes ausentes o turnos que quedan "Sin Registrar".',
                analisisDatos: 'Tomando como caso testigo la agenda "(RX) DENSITOMETRIA OSEA TOTAL" en Sede Santa Fe durante Octubre 2026, sobre 190 turnos totales se registran 128 pacientes Presentes (67,4%), 19 Ausentes (6 ausencias injustificadas y 13 justificadas = 10,0% de No-Show) y 43 turnos en estado "SIN REGISTRAR" (22,6%). Al cruzar por Obra Social, "001 - PROVINCIA" concentra 84 presentes, 8 ausentes y 16 turnos sin cierre administrativo.',
                decisionGestion: 'Se activa el recordatorio automatizado de confirmación de turno por WhatsApp 24 hs antes para Mamografía, Densitometría y Ecografía, y se instruye a recepción para cerrar diariamente los estados pendientes.'
            }
        ],
        indicadoresTabla: [
            ['1. Volumen por Modalidad (2022-2026)', 'SALUS: VLISE_Visitas', 'Conteo mensual y diario de estudios efectivos en ECO, RX, Mamografía, TC y Densitometría.', 'Finalizado'],
            ['2. Tomografía Depurada de Contrastes', 'SALUS: VLISE_Visitas + Peticiones', 'Exclusión estricta de ítems de medio de contraste para medir estudios tomográficos reales.', 'Finalizado'],
            ['3. Tasa de Efectividad y Ausentismo', 'SALUS: VLISE_Visitas (Asistencia)', 'Distribución porcentual: Presente, Internado, Urgencia, Sobreturno vs Ausente y Sin Registrar.', 'Finalizado'],
            ['4. Rendimiento por Agenda y Sede', 'SALUS: VLISE_Visitas (Agenda/Centro)', 'Producción comparativa por equipo/sala en Sede Santa Fe, San Luis Sede 3 y Mitre.', 'Finalizado'],
            ['5. Productividad y SLA de Informantes', 'SALUS: VLISE_Visitas (PrestadorInforma)', 'Estudios informados vs pendientes de informe por médico especialista en imágenes.', 'Finalizado'],
            ['6. Ranking de Médicos Solicitantes', 'SALUS: VLISE_Visitas (Solicitante)', 'Trazabilidad de los profesionales prescriptores que mayor volumen de estudios derivan.', 'Finalizado'],
            ['7. Mix de Financiadores y Obras Sociales', 'SALUS: VLISE_Visitas (Cliente)', 'Volumen de estudios realizados y tasa de ausentismo estratificada por Obra Social.', 'Finalizado'],
            ['8. Demanda de Imágenes desde Guardia', 'SALUS: VLISE_PeticionesRadiologia', 'Articulación en tiempo real de estudios de RX, TC y Ecografía solicitados por Urgencias.', 'Finalizado']
        ]
    }
};

/**
 * Resuelve la clave de servicio ('QUIROFANO', 'GUARDIA', 'UCI', 'EPIDEMIOLOGIA', 'DXI')
 * a partir del nombre o ID del proyecto.
 */
export function resolveServiceKeyFromProject(projectOrName) {
    const raw = typeof projectOrName === 'string'
        ? projectOrName
        : (projectOrName?.nombre || projectOrName?.titulo || projectOrName?.key || '');
    const lower = raw.toLowerCase().trim();

    if (lower.includes('quirofano') || lower.includes('quirófano') || lower.includes('hdd')) return 'QUIROFANO';
    if (lower.includes('guardia') || lower.includes('urgencia') || lower.includes('internado')) return 'GUARDIA';
    if (lower.includes('uci') || lower.includes('crítico') || lower.includes('critico') || lower.includes('terapia')) return 'UCI';
    if (lower.includes('romano') || lower.includes('epidemiolog') || lower.includes('neuro')) return 'EPIDEMIOLOGIA';
    if (lower.includes('imagen') || lower.includes('imágenes') || lower.includes('dxi') || lower.includes('diagnóstico por')) return 'DXI';

    return 'QUIROFANO';
}

/**
 * Construye el objeto jsPDF con estética institucional Sanatorio Argentino
 * para cualquiera de los 5 servicios activos.
 * (Puro: sirve tanto en navegador como en Node.js).
 */
export function buildGobernanzaServicePdfDoc(serviceKeyOrProject, customIndicators = null, customLogoBase64 = null) {
    const key = GOBERNANZA_PROJECTS_DOSSIER_DATA[serviceKeyOrProject]
        ? serviceKeyOrProject
        : resolveServiceKeyFromProject(serviceKeyOrProject);

    const dossier = GOBERNANZA_PROJECTS_DOSSIER_DATA[key] || GOBERNANZA_PROJECTS_DOSSIER_DATA.QUIROFANO;
    const logoImg = customLogoBase64 || SANATORIO_LOGO_BASE64;

    const JsPDFCtor = jsPDF?.jsPDF || jsPDF;
    const runAutoTable = typeof autoTable === 'function' ? autoTable : autoTable?.default;

    const doc = installSafePdfText(new JsPDFCtor({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
    }));

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;
    const contentWidth = pageWidth - margin * 2;
    const bottomSafeY = pageHeight - 25;

    // Paleta Institucional Sanatorio Argentino (Limpia y Clínica)
    const NAVY = [13, 59, 102];          // #0D3B66 Azul Institucional Profundo
    const BLUE = [37, 99, 235];          // #2563EB Azul Institucional Vibrante
    const SKY = [2, 132, 199];           // #0284C7 Celeste Clínico
    const SLATE_DARK = [15, 23, 42];     // #0F172A Texto Principal
    const SLATE_MED = [71, 85, 105];     // #475569 Texto Secundario
    const ICE_BG = [240, 247, 255];      // #F0F7FF Fondo Clínico Suave
    const BORDER_BLUE = [191, 219, 254]; // #BFDBFE Borde Suave
    const EMERALD = [5, 150, 105];       // #059669 Verde Validación

    // Helper para verificar salto de página con margen inferior seguro
    let currentY = 0;
    const ensureSpace = (neededMm) => {
        if (currentY + neededMm > bottomSafeY) {
            doc.addPage();
            drawContinuationHeader();
            currentY = 27;
        }
    };

    // Encabezado compacto en páginas 2..N
    const drawContinuationHeader = () => {
        doc.setFillColor(...NAVY);
        doc.rect(0, 0, pageWidth, 18, 'F');
        doc.setFillColor(...BLUE);
        doc.rect(0, 18, pageWidth, 1.2, 'F');

        try {
            if (logoImg) {
                doc.setFillColor(255, 255, 255);
                doc.roundedRect(margin, 2.5, 13, 13, 2, 2, 'F');
                doc.addImage(logoImg, 'PNG', margin + 1, 3.5, 11, 11);
            }
        } catch (_) {
            // Fallback sin imagen
        }

        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.text(`SANATORIO ARGENTINO · ${dossier.titulo.toUpperCase()}`, margin + 16, 8.2);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(191, 219, 254);
        doc.text('Innovación y Transformación Digital - Dossier Técnico de Gobernanza de Datos', margin + 16, 13.5);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.text(dossier.codigo, pageWidth - margin, 11, { align: 'right' });
    };

    // Helper para títulos de sección
    const drawSectionHeader = (numero, titulo, subtitulo) => {
        ensureSpace(26);
        doc.setFillColor(...ICE_BG);
        doc.setDrawColor(...BORDER_BLUE);
        doc.setLineWidth(0.35);
        doc.roundedRect(margin, currentY, contentWidth, 14, 2, 2, 'FD');

        doc.setFillColor(...NAVY);
        doc.roundedRect(margin, currentY, 3.5, 14, 1, 1, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10.2);
        doc.setTextColor(...NAVY);
        doc.text(`${numero}. ${titulo}`, margin + 7, currentY + 6.2);

        if (subtitulo) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7.8);
            doc.setTextColor(...SLATE_MED);
            doc.text(subtitulo, margin + 7, currentY + 11.2);
        }
        currentY += 18;
    };

    // =========================================================================
    // PÁGINA 1: PORTADA EJECUTIVA E IDENTIDAD INSTITUCIONAL SANATORIO ARGENTINO
    // =========================================================================
    doc.setFillColor(...NAVY);
    doc.rect(0, 0, pageWidth, 54, 'F');

    // Franja inferior acento azul institucional
    doc.setFillColor(...BLUE);
    doc.rect(0, 54, pageWidth, 2.5, 'F');

    // Caja blanca con el Logo del Sanatorio Argentino y debajo "Innovación y Transformación Digital"
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(margin, 8, 44, 38, 3, 3, 'F');
    try {
        if (logoImg) {
            doc.addImage(logoImg, 'PNG', margin + 11, 9.5, 22, 22);
        }
    } catch (_) {
        // Fallback limpio
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.6);
    doc.setTextColor(...NAVY);
    doc.text('SANATORIO ARGENTINO', margin + 22, 35.5, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.4);
    doc.setTextColor(...BLUE);
    doc.text('Innovación y Transformación Digital', margin + 22, 39.5, { align: 'center' });
    doc.setDrawColor(...BORDER_BLUE);
    doc.setLineWidth(0.25);
    doc.line(margin + 4, 41.2, margin + 40, 41.2);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.0);
    doc.setTextColor(...SLATE_MED);
    doc.text('Gobernanza Clínica y de Datos', margin + 22, 44.2, { align: 'center' });

    // Texto principal del encabezado a la derecha del logo
    const headerX = margin + 49;
    const headerMaxW = pageWidth - headerX - margin;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(147, 197, 253);
    doc.text(`PROYECTO DE GOBERNANZA DE DATOS · ${dossier.codigo}`, headerX, 13);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14.5);
    doc.setTextColor(255, 255, 255);
    const titleLines = doc.splitTextToSize(dossier.titulo, headerMaxW);
    doc.text(titleLines, headerX, 20.5);

    const subtitleY = 20.5 + (titleLines.length * 6.0);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.2);
    doc.setTextColor(219, 234, 254);
    const subLines = doc.splitTextToSize(dossier.subtitulo, headerMaxW);
    doc.text(subLines, headerX, subtitleY);

    // Metadatos del proyecto bajo el banner
    currentY = 61;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    doc.roundedRect(margin, currentY, contentWidth, 18.5, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...SLATE_MED);
    doc.text('SERVICIO AUDITADO:', margin + 4, currentY + 5.5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...SLATE_DARK);
    const servLines = doc.splitTextToSize(dossier.servicio, contentWidth - 42);
    doc.text(servLines[0], margin + 35, currentY + 5.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...SLATE_MED);
    doc.text('ÁREA RESPONSABLE:', margin + 4, currentY + 11.2);
    doc.setTextColor(...BLUE);
    doc.text('Sanatorio Argentino - Innovación y Transformación Digital', margin + 35, currentY + 11.2);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...SLATE_MED);
    doc.text('ESTADO DEL PROYECTO:', margin + 4, currentY + 16.2);
    doc.setTextColor(...EMERALD);
    doc.text(`${dossier.estado}   |   Período de Referencia: ${dossier.fechaEmision}`, margin + 39, currentY + 16.2);

    currentY += 23;

    // 4 Tarjetas de Resumen Ejecutivo (KPIs del Proyecto) con altura amplia y tipografía medida antes del split
    const cardGap = 3.2;
    const cardW = (contentWidth - cardGap * 3) / 4;
    const cardH = 24;

    dossier.metricasResumen.forEach((m, idx) => {
        const cx = margin + idx * (cardW + cardGap);
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(...BORDER_BLUE);
        doc.setLineWidth(0.35);
        doc.roundedRect(cx, currentY, cardW, cardH, 2.2, 2.2, 'FD');

        doc.setFillColor(...BLUE);
        doc.rect(cx, currentY, cardW, 1.6, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.3);
        doc.setTextColor(...SLATE_MED);
        const etqLines = doc.splitTextToSize(m.etiqueta.toUpperCase(), cardW - 5);
        doc.text(etqLines[0], cx + 2.5, currentY + 5.8);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.8);
        doc.setTextColor(...NAVY);
        const valSplit = doc.splitTextToSize(m.valor, cardW - 5);
        doc.text(valSplit[0], cx + 2.5, currentY + 11.8);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.6);
        doc.setTextColor(...SLATE_MED);
        const detSplit = doc.splitTextToSize(m.detalle, cardW - 5);
        doc.text(detSplit.slice(0, 2), cx + 2.5, currentY + 16.8);
    });

    currentY += cardH + 6;

    // =========================================================================
    // SECCIÓN 1: ¿QUÉ HEMOS HECHO? (TRANSFORMACIÓN DEL SERVICIO)
    // =========================================================================
    drawSectionHeader(
        '1',
        '¿QUÉ HEMOS HECHO EN EL SERVICIO?',
        'Objetivos alcanzados, módulos desplegados y valor clínico-administrativo para Sanatorio Argentino'
    );

    // Párrafo introductorio en contenedor destacado
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.4);
    const introLines = doc.splitTextToSize(dossier.resumenCorto, contentWidth - 10);
    const introBoxH = 7 + introLines.length * 4.3;
    ensureSpace(introBoxH + 4);

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.28);
    doc.roundedRect(margin, currentY, contentWidth, introBoxH, 2, 2, 'FD');
    doc.setTextColor(...SLATE_DARK);
    doc.text(introLines, margin + 5, currentY + 5.2);
    currentY += introBoxH + 4;

    // Bloques detallados de "Qué hemos hecho"
    dossier.queHemosHecho.forEach((item) => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.8);
        const itemTitleLines = doc.splitTextToSize(item.titulo, contentWidth - 12);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.2);
        const detLines = doc.splitTextToSize(item.detalle, contentWidth - 12);

        const boxH = 8 + (itemTitleLines.length * 4.4) + (detLines.length * 4.2) + 2.5;
        ensureSpace(boxH + 4);

        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(191, 219, 254);
        doc.setLineWidth(0.32);
        doc.roundedRect(margin, currentY, contentWidth, boxH, 2, 2, 'FD');

        doc.setFillColor(...SKY);
        doc.roundedRect(margin, currentY, 2.8, boxH, 1, 1, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.8);
        doc.setTextColor(...NAVY);
        doc.text(itemTitleLines, margin + 6, currentY + 5.8);

        const detStartY = currentY + 5.8 + (itemTitleLines.length * 4.4) + 0.8;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.2);
        doc.setTextColor(...SLATE_DARK);
        doc.text(detLines, margin + 6, detStartY);

        currentY += boxH + 3.5;
    });

    currentY += 2;

    // =========================================================================
    // SECCIÓN 2: ¿CÓMO LO HEMOS HECHO? (ARQUITECTURA Y METODOLOGÍA TÉCNICA)
    // =========================================================================
    drawSectionHeader(
        '2',
        '¿CÓMO LO HEMOS HECHO? (INGENIERÍA Y CALIDAD DE DATOS)',
        'Extracción desde SALUS SQL Server, reglas de depuración clínica y sincronización con el motor Telar'
    );

    dossier.comoLoHemosHecho.forEach((step, idx) => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.7);
        const stepTitleLines = doc.splitTextToSize(step.paso, contentWidth - 16);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.1);
        const expLines = doc.splitTextToSize(step.explicacion, contentWidth - 16);

        const boxH = 8 + (stepTitleLines.length * 4.3) + (expLines.length * 4.2) + 2.5;
        ensureSpace(boxH + 4);

        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.3);
        doc.roundedRect(margin, currentY, contentWidth, boxH, 2, 2, 'FD');

        // Círculo numerado
        doc.setFillColor(...NAVY);
        doc.circle(margin + 6, currentY + 6, 3.2, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(255, 255, 255);
        doc.text(String(idx + 1), margin + 6, currentY + 6.9, { align: 'center' });

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.7);
        doc.setTextColor(...NAVY);
        doc.text(stepTitleLines, margin + 11.5, currentY + 6.0);

        const expStartY = currentY + 6.0 + (stepTitleLines.length * 4.3) + 0.8;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.1);
        doc.setTextColor(...SLATE_DARK);
        doc.text(expLines, margin + 11.5, expStartY);

        currentY += boxH + 3.5;
    });

    currentY += 3;

    // =========================================================================
    // SECCIÓN 3: EJEMPLOS REALES AUDITADOS PASO A PASO (CASOS PRÁCTICOS 2026)
    // =========================================================================
    drawSectionHeader(
        '3',
        'EJEMPLOS REALES AUDITADOS Y CASOS DE USO (2026)',
        'Demostración práctica con cifras reales de Sanatorio Argentino sobre cómo operar e interpretar cada indicador'
    );

    dossier.ejemplosDetallados.forEach((ej) => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        const ejTitleLines = doc.splitTextToSize(ej.titulo, contentWidth - 10);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.0);
        const ctxLines = doc.splitTextToSize(`Contexto Clínico / Gestión: ${ej.contexto}`, contentWidth - 12);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.1);
        const datLines = doc.splitTextToSize(`Lectura Detallada del Dato Real: ${ej.analisisDatos}`, contentWidth - 12);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.0);
        const decLines = doc.splitTextToSize(`Acción y Toma de Decisión: ${ej.decisionGestion}`, contentWidth - 12);

        const headerBarH = Math.max(8.5, ejTitleLines.length * 4.3 + 4);
        const bodyH = (ctxLines.length * 4.2) + (datLines.length * 4.2) + (decLines.length * 4.2) + 10;
        const boxH = headerBarH + bodyH;
        ensureSpace(boxH + 5);

        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(...BORDER_BLUE);
        doc.setLineWidth(0.35);
        doc.roundedRect(margin, currentY, contentWidth, boxH, 2.2, 2.2, 'FD');

        // Barra superior del ejemplo
        doc.setFillColor(...ICE_BG);
        doc.roundedRect(margin + 0.3, currentY + 0.3, contentWidth - 0.6, headerBarH, 1.8, 1.8, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(...NAVY);
        doc.text(ejTitleLines, margin + 4.5, currentY + 5.5);

        let innerY = currentY + headerBarH + 4.5;

        // 1. Contexto
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.0);
        doc.setTextColor(...BLUE);
        doc.text(ctxLines, margin + 4.5, innerY);
        innerY += ctxLines.length * 4.2 + 1.8;

        // 2. Datos Reales
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.1);
        doc.setTextColor(...SLATE_DARK);
        doc.text(datLines, margin + 4.5, innerY);
        innerY += datLines.length * 4.2 + 1.8;

        // 3. Decisión
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.0);
        doc.setTextColor(...EMERALD);
        doc.text(decLines, margin + 4.5, innerY);

        currentY += boxH + 4.5;
    });

    // =========================================================================
    // SECCIÓN 4: MATRIZ TÉCNICA DE INDICADORES Y REGLAS DE NEGOCIO
    // =========================================================================
    drawSectionHeader(
        '4',
        'CATÁLOGO DE INDICADORES Y REGLAS DE AUDITORÍA',
        'Inventario completo de requerimientos finalizados, tablas origen en SALUS y lógica de cálculo'
    );

    const rawRows = (customIndicators && customIndicators.length > 0)
        ? customIndicators.map((ind, idx) => [
            `${idx + 1}. ${ind.titulo || 'Indicador'}`,
            ind.origen_informacion || 'SALUS SQL Server',
            (ind.informacion_buscada || '').replace(/\s+/g, ' ').slice(0, 220),
            ind.estado || 'Finalizado'
        ])
        : dossier.indicadoresTabla;

    const tableRows = rawRows.map(row => row.map(cell => sanitizePdfText(cell)));

    runAutoTable(doc, {
        startY: currentY,
        margin: { top: 25, left: margin, right: margin, bottom: 24 },
        head: [['Indicador / Métrica', 'Origen de Datos (SALUS)', 'Definición Operativa y Regla de Cálculo', 'Estado']],
        body: tableRows,
        theme: 'grid',
        styles: {
            font: 'helvetica',
            fontSize: 7.6,
            cellPadding: 2.8,
            textColor: SLATE_DARK,
            lineColor: [219, 234, 254],
            lineWidth: 0.25,
            valign: 'middle'
        },
        headStyles: {
            fillColor: NAVY,
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 8.0,
            halign: 'left'
        },
        alternateRowStyles: {
            fillColor: [248, 250, 252]
        },
        columnStyles: {
            0: { cellWidth: 44, fontStyle: 'bold', textColor: NAVY },
            1: { cellWidth: 38, textColor: BLUE },
            2: { cellWidth: 78 },
            3: { cellWidth: 22, halign: 'center', fontStyle: 'bold', textColor: EMERALD }
        },
        didDrawPage: (data) => {
            if (data.pageNumber > 1) {
                drawContinuationHeader();
            }
        }
    });

    currentY = (doc.lastAutoTable?.finalY || currentY) + 8;

    // Bloque de Cierre Institucional y Firma Digital
    ensureSpace(32);
    doc.setFillColor(...ICE_BG);
    doc.setDrawColor(...BORDER_BLUE);
    doc.setLineWidth(0.35);
    doc.roundedRect(margin, currentY, contentWidth, 28, 2.5, 2.5, 'FD');

    try {
        if (logoImg) {
            doc.setFillColor(255, 255, 255);
            doc.roundedRect(margin + 4, currentY + 4, 20, 20, 2, 2, 'F');
            doc.addImage(logoImg, 'PNG', margin + 6, currentY + 5, 16, 16);
        }
    } catch (_) {
        // Fallback
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...NAVY);
    doc.text('SANATORIO ARGENTINO', margin + 28, currentY + 10);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...BLUE);
    doc.text('Innovación y Transformación Digital', margin + 28, currentY + 15);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.6);
    doc.setTextColor(...SLATE_MED);
    doc.text(
        'Documento Técnico Oficial de Gobernanza de Datos Clínicos y Operativos. Todos los indicadores aquí documentados se encuentran',
        margin + 28,
        currentY + 20.5
    );
    doc.text(
        'auditados sobre la base de datos institucional SALUS y sincronizados con los tableros ejecutivos de gestión.',
        margin + 28,
        currentY + 24.5
    );

    // =========================================================================
    // PIE DE PÁGINA INSTITUCIONAL EN TODAS LAS PÁGINAS
    // =========================================================================
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        const footerY = pageHeight - 13;

        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.3);
        doc.line(margin, footerY - 2, pageWidth - margin, footerY - 2);

        try {
            if (logoImg) {
                doc.addImage(logoImg, 'PNG', margin, footerY - 0.5, 6.5, 6.5);
            }
        } catch (_) {
            // Fallback
        }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.2);
        doc.setTextColor(...NAVY);
        doc.text('Sanatorio Argentino', margin + 8, footerY + 2.2);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.8);
        doc.setTextColor(...BLUE);
        doc.text('Innovación y Transformación Digital', margin + 8, footerY + 5.5);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.0);
        doc.setTextColor(...SLATE_MED);
        doc.text(`${dossier.titulo} · ${dossier.codigo}`, pageWidth / 2 + 8, footerY + 3.8, { align: 'center' });

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.2);
        doc.setTextColor(...NAVY);
        doc.text(`Página ${i} de ${totalPages}`, pageWidth - margin, footerY + 3.8, { align: 'right' });
    }

    return { doc, dossier, key };
}

/**
 * Descarga directamente en el navegador el Documento PDF Oficial del proyecto de Gobernanza.
 */
export async function downloadGobernanzaServicePdf(serviceKeyOrProject, customIndicators = null) {
    const logoBase64 = await getSanatorioLogoBase64();
    const { doc, dossier } = buildGobernanzaServicePdfDoc(serviceKeyOrProject, customIndicators, logoBase64);
    const safeName = dossier.titulo
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_|_$/g, '');
    const fileName = `Dossier_Gobernanza_${safeName}_Sanatorio_Argentino.pdf`;
    doc.save(fileName);
    return fileName;
}
