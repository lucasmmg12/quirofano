import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import {
    GOBERNANZA_PROJECTS_DOSSIER_DATA,
    buildGobernanzaServicePdfDoc
} from '../src/utils/gobernanzaServiceProjectPdf.js';

const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY
);

async function main() {
    console.log('1. Cargando logo institucional de public/logosanatorio.png...');
    const logoPath = path.resolve('public/logosanatorio.png');
    let logoDataUrl = null;
    if (fs.existsSync(logoPath)) {
        const buf = fs.readFileSync(logoPath);
        logoDataUrl = `data:image/png;base64,${buf.toString('base64')}`;
        console.log('   Logo cargado:', buf.length, 'bytes');
    }

    // 2. Consultar proyectos actuales
    const { data: existingProjects, error: projErr } = await supabase
        .from('gobernanza_proyectos')
        .select('*');
    if (projErr) throw projErr;

    console.log('Proyectos actuales en gobernanza_proyectos:', existingProjects.map(p => ({ id: p.id, nombre: p.nombre })));

    // Identificar o crear los 5 proyectos
    const PROJECT_IDS = {
        QUIROFANO: 'cf0caff1-e6b6-4142-ac3d-24e3eaff9273',
        GUARDIA: '15533f6c-df44-42ae-a6f7-e3376d3b58fc',
        UCI: '9e707b55-8dca-4db3-8db4-4c282c232c1c',
        EPIDEMIOLOGIA: 'd317186f-977c-4a36-b578-ef3d9e746609',
        DXI: null
    };

    const existingDxi = existingProjects.find(p =>
        p.nombre.toLowerCase().includes('imagen') ||
        p.nombre.toLowerCase().includes('imágenes') ||
        p.nombre.toLowerCase().includes('dxi')
    );

    if (existingDxi) {
        PROJECT_IDS.DXI = existingDxi.id;
    } else {
        const { data: createdDxi, error: createErr } = await supabase
            .from('gobernanza_proyectos')
            .insert([{
                nombre: 'Diagnóstico por Imágenes (DxI)',
                estado: 'Activo',
                descripcion: GOBERNANZA_PROJECTS_DOSSIER_DATA.DXI.resumenCorto
            }])
            .select()
            .single();
        if (createErr) throw createErr;
        PROJECT_IDS.DXI = createdDxi.id;
        console.log('   Proyecto Diagnóstico por Imágenes (DxI) creado con ID:', PROJECT_IDS.DXI);
    }

    // 3. Actualizar nombres, estados y descripciones detalladas de los 5 proyectos
    const projectUpdates = [
        {
            id: PROJECT_IDS.QUIROFANO,
            nombre: 'Quirófano Central y Hospital de Día',
            estado: 'Activo',
            descripcion: 'QUÉ HICIMOS: Unificación del monitoreo de Quirófano Central (Qx 1 a Qx 4), Hospital de Día (Qx 5 y Qx 6) y Sala de Partos (713 cx/mes); auditoría forense de suspensiones (en el día vs >24h y causas raíz); ocupación real de bloques quirúrgicos; productividad por cirujano/especialidad; soporte intraoperatorio (Rx/Lab) y trazabilidad transfusional. CÓMO LO HICIMOS: Integración directa desde SALUS SQL Server (TABLEAU_Quirofano, TurnosQuirurgicos, SER_HojaTransfusional) sincronizada con el motor global Telar.'
        },
        {
            id: PROJECT_IDS.GUARDIA,
            nombre: 'Guardia Clínica y Seguimiento en Internado',
            estado: 'Activo',
            descripcion: 'QUÉ HICIMOS: Auditoría integral de Triage y Severidad; curva de tiempos puerta-médico por franjas (≤30m, 31-60m, 61-90m, >90m y permanencia >3h sobre 1.830 pacientes/mes); conversión quirúrgica en ≤48h depurada de cirugías programadas; seguimiento clínico en Internado (1.862 admisiones), Traumatología (302) e Interconsultas (3.233); y Agente IA Generador de Epicrisis y Copiloto HC. CÓMO LO HICIMOS: Cruce multicapa en SALUS (VLISE_Visitas, TABLEAU_Admisiones, TABLEAU_Cirugias y formularios clínicos) con aislamiento estricto por NHC.'
        },
        {
            id: PROJECT_IDS.UCI,
            nombre: 'Cuidados Críticos (UCI)',
            estado: 'Activo',
            descripcion: 'QUÉ HICIMOS: Estandarización de la capacidad real en 16 camas operativas (8 UTI + 8 Cuidados Intermedios); motor dual de ocupación (Censo de Medianoche vs Horas Exactas) con recorte por período y diagrama Gantt; estancia media (ALOS) y Giro Cama; auditoría nominal de mortalidad (<48h vs ≥48h) con Dossier Clínico; Kinesiología Crítica, Hemoterapia y soporte diagnóstico VLISE por Box. CÓMO LO HICIMOS: Procesamiento de TABLEAU_Admisiones, prestaciones kinésicas, hemoterapia y peticiones VLISE sobre egresos confirmados.'
        },
        {
            id: PROJECT_IDS.EPIDEMIOLOGIA,
            nombre: 'Vigilancia Epidemiológica y Neurocirugía (Dr. Romano)',
            estado: 'Activo',
            descripcion: 'QUÉ HICIMOS: Automatización de la Planilla C2 de Vigilancia Epidemiológica obligatoria (SNVS 2.0: Bronquiolitis en menores de 2 años, ETI/Influenza, Neumonías, Diarreas Agudas, Varicela y ETS/ITS — 2.920 notificaciones anuales) y trazabilidad quirúrgica de Neurocirugía y Neurología. CÓMO LO HICIMOS: Mapeo terminológico CIE-9/CIE-10 y texto diagnóstico en SALUS (TABLEAU_Diagnosticos y motivo consulta) cruzado con VLISE_DatosPaciente para cálculo exacto de edad en meses (<24m) al día de la visita.'
        },
        {
            id: PROJECT_IDS.DXI,
            nombre: 'Diagnóstico por Imágenes (DxI)',
            estado: 'Activo',
            descripcion: 'QUÉ HICIMOS: Tablero integral 2022–2026 de las 5 modalidades oficiales (Ecografía: 5.166 estudios/mes, Radiología: 1.266, Mamografía: 477, Tomografía: 401 y Densitometría: 128 — total 7.438 estudios efectivos en Oct 2026); depuración algorítmica de inyecciones de contraste en TC; control de ausentismo (No-Show), médicos realizadores, SLA de informantes, derivadores y obras sociales. CÓMO LO HICIMOS: Extracción desde VLISE_Visitas y VLISE_PeticionesPruebasRadiologia con filtro anti-duplicación de contrastes.'
        }
    ];

    for (const upd of projectUpdates) {
        const { error: uErr } = await supabase
            .from('gobernanza_proyectos')
            .update({
                nombre: upd.nombre,
                estado: upd.estado,
                descripcion: upd.descripcion
            })
            .eq('id', upd.id);
        if (uErr) throw uErr;
        console.log(`   Proyecto actualizado: ${upd.nombre} (${upd.id})`);
    }

    // 4. Completar y estandarizar indicadores en gobernanza_indicadores para los 5 proyectos
    // 4.A: UCI -> Completar indicadores faltantes y pasar todos a 'Finalizado'
    const { data: uciInds } = await supabase
        .from('gobernanza_indicadores')
        .select('*')
        .eq('proyecto_id', PROJECT_IDS.UCI);

    for (const ind of (uciInds || [])) {
        let updates = { estado: 'Finalizado' };
        if (ind.titulo === 'Cantidad de Transfusiones') {
            updates = {
                ...updates,
                titulo: 'Hemovigilancia y Trazabilidad de Transfusiones en UCI',
                origen_informacion: 'SALUS: [SER_HojaTransfusional] vinculada a [TABLEAU_Admisiones]',
                ciclo_datos: 'Registro Continuo / Cierre Mensual',
                query_sql: `-- HEMOVIGILANCIA Y ACTOS TRANSFUSIONALES EN UNIDAD DE CUIDADOS CRÍTICOS (UCI)
SELECT 
    FORMAT(adm.[Fecha ingreso], 'yyyy-MM') AS [Periodo],
    ht.[TipoHemocomponente] AS [Hemocomponente],
    COUNT(DISTINCT ht.[IdActoTransfusional]) AS [Unidades_Transfundidas],
    COUNT(DISTINCT adm.[NHC]) AS [Pacientes_Transfundidos],
    CAST(COUNT(DISTINCT adm.[NHC]) * 100.0 / 
         NULLIF((SELECT COUNT(DISTINCT a2.[NHC]) FROM [SALUS].[dbo].[TABLEAU_Admisiones] a2 
                 WHERE a2.Especialidad = 'TERAPIA INTENSIVA' 
                   AND FORMAT(a2.[Fecha ingreso], 'yyyy-MM') = FORMAT(adm.[Fecha ingreso], 'yyyy-MM')), 0)
         AS DECIMAL(5,2)) AS [Tasa_Pacientes_Transfundidos_Pct]
FROM [SALUS].[dbo].[TABLEAU_Admisiones] adm
INNER JOIN [SALUS].[dbo].[SER_HojaTransfusional] ht
    ON adm.[NHC] = ht.[NHC]
   AND ht.[FechaTransfusion] BETWEEN adm.[Fecha ingreso] AND ISNULL(adm.[Fecha alta], GETDATE())
WHERE adm.[Especialidad] = 'TERAPIA INTENSIVA'
  AND YEAR(adm.[Fecha ingreso]) IN (2022, 2023, 2024, 2025, 2026)
GROUP BY FORMAT(adm.[Fecha ingreso], 'yyyy-MM'), ht.[TipoHemocomponente]
ORDER BY [Periodo] DESC, [Unidades_Transfundidas] DESC;`,
                explicacion_query: `### Lógica de Hemovigilancia en Cuidados Críticos
1. **Cruce Episódico Exacto**: Vincula cada internación de \`TABLEAU_Admisiones\` (\`Especialidad = 'TERAPIA INTENSIVA'\`) con los registros de \`SER_HojaTransfusional\` ocurridos dentro de la ventana temporal de estadía en UCI.
2. **Desglose por Hemocomponente**: Cuantifica unidades de Glóbulos Rojos Desplasmatizados (GRD), Plasma Fresco Congelado (PFC), Concentrado de Plaquetas y Crioprecipitados.
3. **Indicador de Complejidad**: Calcula el porcentaje de pacientes críticos que requirieron soporte transfusional durante su internación.`
            };
        } else if (ind.titulo === 'Análisis de defunciones') {
            updates = {
                ...updates,
                titulo: 'Auditoría Nominal de Mortalidad Precoz (<48 hs) vs Tardía (≥48 hs)',
                informacion_buscada: 'Desglose clínico y forense de los óbitos ocurridos en la Unidad de Cuidados Críticos (UCI), discriminando la mortalidad precoz (< 48 horas desde el ingreso a la unidad, asociada a patología crítica irreversible de arribo) frente a la mortalidad tardía (≥ 48 horas), con acceso al Dossier Clínico completo por NHC.',
                origen_informacion: 'SALUS: [TABLEAU_Admisiones] + Evoluciones HCE y Laboratorio VLISE',
                ciclo_datos: 'Cierre Diario / Auditoría de Comité de Morbimortalidad',
                query_sql: `-- AUDITORÍA FORENSE DE MORTALIDAD EN UCI (< 48 HS VS >= 48 HS)
SELECT 
    adm.[Número admisión] AS [NroAdmision],
    adm.[NHC],
    adm.[Paciente],
    adm.[Edad],
    adm.[Cliente] AS [Financiador],
    adm.[Procedencia],
    adm.[Fecha ingreso] AS [FechaIngreso],
    adm.[Fecha alta] AS [FechaFallecimiento],
    DATEDIFF(HOUR, adm.[Fecha ingreso], adm.[Fecha alta]) AS [Horas_Estadia_UCI],
    DATEDIFF(DAY, adm.[Fecha ingreso], adm.[Fecha alta]) AS [Dias_Estancia],
    CASE 
        WHEN DATEDIFF(HOUR, adm.[Fecha ingreso], adm.[Fecha alta]) < 48 THEN 'Mortalidad Precoz (< 48 hs)'
        ELSE 'Mortalidad Tardía (>= 48 hs)'
    END AS [Clasificacion_Mortalidad],
    adm.[Motivo de alta] AS [MotivoAlta]
FROM [SALUS].[dbo].[TABLEAU_Admisiones] adm
WHERE adm.[Especialidad] = 'TERAPIA INTENSIVA'
  AND adm.[Fecha alta] IS NOT NULL
  AND (
      UPPER(adm.[Motivo de alta]) LIKE '%DEFUN%'
      OR UPPER(adm.[Motivo de alta]) LIKE '%OBIT%'
      OR UPPER(adm.[Motivo de alta]) LIKE '%FALLEC%'
  )
  AND YEAR(adm.[Fecha ingreso]) IN (2022, 2023, 2024, 2025, 2026)
ORDER BY adm.[Fecha alta] DESC;`,
                explicacion_query: `### Auditoría Clínica de Defunciones
1. **Separación < 48 hs vs ≥ 48 hs**: Evalúa en horas exactas (\`DATEDIFF(HOUR, [Fecha ingreso], [Fecha alta])\`) el tiempo transcurrido en UCI hasta el desenlace para separar la mortalidad atribuible al estado crítico de ingreso de la mortalidad intrahospitalaria evolutiva.
2. **Integración con Dossier Clínico**: Alimenta el modal interactivo de Auditoría de Mortalidad en el dashboard de UCI, permitiendo inspeccionar antecedentes, procedencia, signos vitales y laboratorios de cada paciente.`
            };
        } else if (ind.titulo === 'ENFERMERIA') {
            updates = {
                ...updates,
                titulo: 'Indicadores de Enfermería Crítica y Densidad Diagnóstica por Box (Box 1 a 16)',
                informacion_buscada: 'Monitoreo de la carga asistencial de enfermería, controles de signos vitales, balance hídrico y densidad de estudios complementarios (Laboratorio y Radiología portátil VLISE) distribuidos por cada box físico de las 16 camas críticas (8 UTI + 8 Cuidados Intermedios).',
                origen_informacion: 'SALUS: [VLISE_Peticiones] + [PR InstRespEntrada] (Controles de Enfermería por Box)',
                ciclo_datos: 'Continuo por Turno de Enfermería (Mañana, Tarde y Noche)',
                query_sql: `-- DENSIDAD ASISTENCIAL Y SOPORTE DIAGNÓSTICO POR BOX EN UCI (16 CAMAS)
SELECT 
    ISNULL(p.[Cama_Box], 'Sin Box Especificado') AS [Box_UCI],
    COUNT(DISTINCT p.[IdPeticion]) AS [Total_Estudios_Solicitados],
    COUNT(DISTINCT CASE WHEN p.[Servicio] = 'LABORATORIO' THEN p.[IdPeticion] END) AS [Peticiones_Laboratorio],
    COUNT(DISTINCT CASE WHEN p.[Servicio] = 'RADIOLOGIA' THEN p.[IdPeticion] END) AS [Peticiones_Rx_Imagenes],
    COUNT(DISTINCT p.[NHC]) AS [Pacientes_Atendidos_Box]
FROM [SALUS].[dbo].[VLISE_Peticiones_UCI] p
WHERE p.[Fecha_Peticion] >= '2026-01-01'
GROUP BY ISNULL(p.[Cama_Box], 'Sin Box Especificado')
ORDER BY [Total_Estudios_Solicitados] DESC;`,
                explicacion_query: `### Distribución de Carga por Box Físico (16 Camas)
1. **Trazabilidad por Cama/Box**: Mapea la intensidad de cuidados y pedidos de apoyo diagnóstico en cada uno de los boxes de Terapia Intensiva y Cuidados Intermedios.
2. **Gestión de Recursos de Enfermería**: Permite equilibrar la asignación enfermero-paciente según la complejidad real de cada box.`
            };
        }

        const { error } = await supabase
            .from('gobernanza_indicadores')
            .update(updates)
            .eq('id', ind.id);
        if (error) throw error;
    }

    // Agregar indicador #10 de Kinesiología en UCI si no existe
    const hasKineUci = (uciInds || []).some(i => (i.titulo || '').toLowerCase().includes('kinesiolog'));
    if (!hasKineUci) {
        const { error: kErr } = await supabase
            .from('gobernanza_indicadores')
            .insert([{
                proyecto_id: PROJECT_IDS.UCI,
                titulo: 'Kinesiología Intensiva: Rehabilitación Respiratoria y Motora en UCI',
                informacion_buscada: 'Cuantificación nominal y mensual de las sesiones de kinesioterapia respiratoria, manejo de asistencia respiratoria mecánica (ARM), destete ventilatorio y movilización precoz realizadas a pacientes internados en las 16 camas de Cuidados Críticos.',
                origen_informacion: 'SALUS: [VLISE_Visitas] / Prestaciones de Kinesiología en Internación Crítica',
                ciclo_datos: 'Diario / Consolidado Mensual',
                query_sql: `-- PRODUCCIÓN DE KINESIOLOGÍA INTENSIVA EN UNIDAD DE CUIDADOS CRÍTICOS (UCI)
SELECT 
    FORMAT(v.[Fecha Visita], 'yyyy-MM') AS [Mes],
    v.[Responsable] AS [Kinesiologo_Interviniente],
    v.[Tipo Visita] AS [Tipo_Prestacion_Kinesica],
    COUNT(DISTINCT v.[idVisita]) AS [Total_Sesiones_Realizadas],
    COUNT(DISTINCT v.[NHC]) AS [Pacientes_Asistidos]
FROM [SALUS].[dbo].[VLISE_Visitas] v
INNER JOIN [SALUS].[dbo].[TABLEAU_Admisiones] adm
    ON v.[NHC] = adm.[NHC]
   AND v.[Fecha Visita] BETWEEN adm.[Fecha ingreso] AND ISNULL(adm.[Fecha alta], GETDATE())
WHERE adm.[Especialidad] = 'TERAPIA INTENSIVA'
  AND (v.[Especialidad] LIKE '%KINESI%' OR v.[Grupo Agenda] LIKE '%KINESI%')
  AND v.[Asistencia] = 'Presente'
  AND v.[Fecha Visita] >= '2026-01-01'
GROUP BY FORMAT(v.[Fecha Visita], 'yyyy-MM'), v.[Responsable], v.[Tipo Visita]
ORDER BY [Mes] DESC, [Total_Sesiones_Realizadas] DESC;`,
                explicacion_query: `### Seguimiento de Kinesiología Crítica
1. **Cruce con Episodios de UCI**: Audita todas las prestaciones kinésicas efectuadas durante la permanencia del paciente en Terapia Intensiva o Cuidados Intermedios.
2. **Productividad y Cobertura**: Mide la frecuencia de atención kinésica por paciente-día y el rendimiento del equipo de Kinesiología Intensiva.`,
                estado: 'Finalizado'
            }]);
        if (kErr) throw kErr;
    }
    console.log('   Indicadores de UCI actualizados al 100% Finalizado.');

    // 4.B: EPIDEMIOLOGÍA (Dr. Romano) -> Pasar Neurocirugía a 'Finalizado' y enriquecer
    const { data: epiInds } = await supabase
        .from('gobernanza_indicadores')
        .select('*')
        .eq('proyecto_id', PROJECT_IDS.EPIDEMIOLOGIA);

    for (const ind of (epiInds || [])) {
        let updates = { estado: 'Finalizado' };
        if (ind.titulo === 'Neurocirugia' || ind.titulo.toLowerCase().includes('neurocirug')) {
            updates = {
                ...updates,
                titulo: 'Producción Quirúrgica y Consultas de Neurocirugía y Neurología',
                informacion_buscada: 'Volumen histórico y mensual (últimos 5 años) de intervenciones neuroquirúrgicas codificadas bajo modalidad (CX) y prestaciones asistenciales de Neurocirugía y Neurología con asistencia efectiva en Sanatorio Argentino.',
                origen_informacion: 'SALUS: [VLISE_Visitas con categoria] y [TABLEAU_Cirugias]',
                ciclo_datos: 'Mensual (con actualización continua)'
            };
        }
        const { error } = await supabase
            .from('gobernanza_indicadores')
            .update(updates)
            .eq('id', ind.id);
        if (error) throw error;
    }
    console.log('   Indicadores de Vigilancia Epidemiológica (Dr. Romano) actualizados al 100% Finalizado.');

    // 4.C: GUARDIA CLÍNICA -> Asegurar que estén los indicadores de Seguimiento en Internado, Traumatología/Interconsultas y Agente IA de Epicrisis
    const { data: guaInds } = await supabase
        .from('gobernanza_indicadores')
        .select('*')
        .eq('proyecto_id', PROJECT_IDS.GUARDIA);

    const newGuardiaIndicators = [
        {
            titulo: 'Seguimiento Clínico y Pase en Internado (Shock Room, Piso y UCI)',
            informacion_buscada: 'Auditoría integral de la continuidad asistencial de los pacientes ingresados a internación clínica (1.862 admisiones auditadas en 2026): cobertura de historia clínica de admisión en piso (1.461 completas), distribución operativa entre Shock Room (664), Internado General (1.089) y UCI (270), y productividad de evoluciones médicas del plantel clínico.',
            origen_informacion: 'SALUS: [TABLEAU_Admisiones] cruzada con [PR InstRespVisitaPaciente] y [PR InstRespEntrada]',
            ciclo_datos: 'Diario / Sincronización Continua',
            query_sql: `-- SEGUIMIENTO CLÍNICO Y COBERTURA DE ADMISIÓN EN INTERNADO
SELECT 
    FORMAT(adm.[Fecha ingreso], 'yyyy-MM') AS [Mes],
    COUNT(DISTINCT adm.[idAdmision]) AS [Total_Admisiones_Clinicas],
    COUNT(DISTINCT CASE WHEN r.[idRespuesta] IS NOT NULL THEN adm.[idAdmision] END) AS [Con_Historia_Admision_Completa],
    COUNT(DISTINCT CASE WHEN adm.[Servicio] LIKE '%SHOCK%' THEN adm.[idAdmision] END) AS [Area_Shock_Room],
    COUNT(DISTINCT CASE WHEN adm.[Servicio] LIKE '%INTERNADO%' OR adm.[Especialidad] = 'CLINICO ' THEN adm.[idAdmision] END) AS [Area_Internado_Piso],
    COUNT(DISTINCT CASE WHEN adm.[Servicio] LIKE '%UCI%' OR adm.[Especialidad] LIKE '%TERAPIA%' THEN adm.[idAdmision] END) AS [Area_UCI]
FROM [SALUS].[dbo].[TABLEAU_Admisiones] adm
LEFT JOIN [SALUS].[dbo].[PR InstRespVisitaPaciente] r
    ON adm.[NHC] = r.[NHC]
   AND r.[Fecha] BETWEEN DATEADD(DAY, -1, adm.[Fecha ingreso]) AND ISNULL(adm.[Fecha alta], GETDATE())
WHERE adm.[Fecha ingreso] >= '2026-01-01'
GROUP BY FORMAT(adm.[Fecha ingreso], 'yyyy-MM')
ORDER BY [Mes] DESC;`,
            explicacion_query: `### Continuidad Asistencial Guardia -> Internado
1. **Trazabilidad de Cobertura Clínica**: Mide cuántas admisiones hospitalarias cuentan con la evaluación médica estructurada de ingreso y evoluciones diarias firmadas por el staff de Clínica Médica.
2. **Segmentación por Área Operativa**: Permite auditar el flujo entre Shock Room, Piso de Internación General y Unidad de Cuidados Críticos.`,
            estado: 'Finalizado'
        },
        {
            titulo: 'Auditoría de Traumatología en Piso y Red de Interconsultas Hospitalarias',
            informacion_buscada: 'Monitoreo nominal de las admisiones hospitalarias del servicio de Ortopedia y Traumatología (302 episodios auditados en 2026) y trazabilidad de la red de Interconsultas entre especialidades en internación (3.233 interconsultas totales: 238 de Clínica Médica y 2.995 de especialidades interconsultoras).',
            origen_informacion: 'SALUS: [TABLEAU_Admisiones] y [VLISE_Visitas] (Ámbito Hospitalización / Interconsultas)',
            ciclo_datos: 'Diario / Mensual',
            query_sql: `-- AUDITORÍA DE TRAUMATOLOGÍA EN INTERNADO Y RED DE INTERCONSULTAS
SELECT 
    FORMAT(v.[Fecha Visita], 'yyyy-MM') AS [Mes],
    v.[Especialidad] AS [Especialidad_Interconsultora],
    v.[Responsable] AS [Medico_Interconsultor],
    COUNT(DISTINCT v.[idVisita]) AS [Total_Interconsultas],
    COUNT(DISTINCT v.[NHC]) AS [Pacientes_Asistidos]
FROM [SALUS].[dbo].[VLISE_Visitas] v
WHERE (v.[Tipo Visita] LIKE '%INTERCONSULTA%' OR v.[Ambito] = 'Hospitalización')
  AND v.[Fecha Visita] >= '2026-01-01'
  AND v.[Asistencia] = 'Presente'
GROUP BY FORMAT(v.[Fecha Visita], 'yyyy-MM'), v.[Especialidad], v.[Responsable]
ORDER BY [Mes] DESC, [Total_Interconsultas] DESC;`,
            explicacion_query: `### Trazabilidad de Traumatología e Interconsultas
1. **Seguimiento Traumatológico en Piso**: Aísla los pacientes internados bajo Ortopedia y Traumatología para auditar tiempos prequirúrgicos, estadía media y médico a cargo.
2. **Mapeo de Interconsultas**: Cuantifica la demanda de interconsultas intrahospitalarias respondidas por cada especialidad y profesional.`,
            estado: 'Finalizado'
        },
        {
            titulo: 'Agente IA Generador de Epicrisis y Copiloto de Historia Clínica (Aislamiento por NHC)',
            informacion_buscada: 'Reconstrucción longitudinal automatizada del episodio de internación (Shock Room -> Quirófano -> UCI -> Piso), conciliación de medicación habitual, esquema infectológico con días efectivos de antibióticos y redacción asistida por Inteligencia Artificial de la Epicrisis médica bajo aislamiento estricto por NHC.',
            origen_informacion: 'SALUS: [TABLEAU_Admisiones], [TABLEAU_Cirugias], [PR InstRespVisitaPaciente] + Motor IA Sanatorio Argentino',
            ciclo_datos: 'Tiempo Real en el Alta Hospitalaria',
            query_sql: `-- EXTRACCIÓN LONGITUDINAL POR NHC Y EPISODIO PARA COPILOTO DE EPICRISIS
DECLARE @NHC VARCHAR(20) = '084219';
DECLARE @IdAdmision INT = 1048291;

SELECT 
    adm.[idAdmision],
    adm.[NHC],
    adm.[Paciente],
    adm.[Edad],
    adm.[Fecha ingreso],
    adm.[Fecha alta],
    adm.[Servicio],
    adm.[Especialidad],
    resp.[Fecha] AS [Fecha_Registro_HCE],
    resp.[Campo_Clinico],
    resp.[Valor_Respuesta]
FROM [SALUS].[dbo].[TABLEAU_Admisiones] adm
INNER JOIN [SALUS].[dbo].[PR InstRespVisitaPaciente] resp
    ON adm.[NHC] = resp.[NHC]
   AND resp.[Fecha] BETWEEN adm.[Fecha ingreso] AND ISNULL(adm.[Fecha alta], GETDATE())
WHERE adm.[NHC] = @NHC
  AND adm.[idAdmision] = @IdAdmision
ORDER BY resp.[Fecha] ASC;`,
            explicacion_query: `### Arquitectura de Seguridad Clínica y Aislamiento por NHC
1. **Cero Mezcla de Pacientes**: La consulta y el dossier estructurado filtran estrictamente por el par único \`(NHC, idAdmision)\`, impidiendo cualquier cruce de información entre pacientes o episodios antiguos.
2. **Síntesis Asistida**: Consolida antecedentes, cirugías, pase por UCI, laboratorio relevante y días de antibioticoterapia para generar el borrador normado de Epicrisis.`,
            estado: 'Finalizado'
        }
    ];

    for (const newInd of newGuardiaIndicators) {
        const exists = (guaInds || []).some(i => i.titulo === newInd.titulo);
        if (!exists) {
            const { error: insErr } = await supabase
                .from('gobernanza_indicadores')
                .insert([{
                    proyecto_id: PROJECT_IDS.GUARDIA,
                    ...newInd
                }]);
            if (insErr) throw insErr;
        }
    }
    console.log('   Indicadores de Guardia Clínica e Internado actualizados al 100% Finalizado.');

    // 4.D: DIAGNÓSTICO POR IMÁGENES (DxI) -> Insertar los 8 indicadores completos en estado 'Finalizado'
    const { data: dxiInds } = await supabase
        .from('gobernanza_indicadores')
        .select('*')
        .eq('proyecto_id', PROJECT_IDS.DXI);

    const dxiIndicatorsSpec = [
        {
            titulo: 'Volumen Multianual y Mensual por Modalidad (ECO, RX, Mamografía, TC y Densitometría)',
            informacion_buscada: 'Evolución histórica (2022 a 2026), mensual y diaria del volumen de estudios efectivamente realizados en las 5 prestaciones oficiales del Servicio de Diagnóstico por Imágenes: Ecografía (5.166 estudios en Oct 2026), Radiología (1.266), Mamografía (477), Tomografía Computada (401) y Densitometría Ósea (128), totalizando 7.438 estudios efectivos mensuales.',
            origen_informacion: 'SALUS: [VLISE_Visitas] (Agendas de Diagnóstico por Imágenes)',
            ciclo_datos: 'Diario / Mensual / Serie Histórica 2022–2026',
            query_sql: `-- VOLUMEN DE ESTUDIOS REALIZADOS POR MODALIDAD OFICIAL (DIAGNÓSTICO POR IMÁGENES)
DECLARE @FechaDesde DATE = '2026-10-01';
DECLARE @FechaHasta DATE = '2026-10-31';

SELECT 
    CASE 
        WHEN v.[Agenda] LIKE '%DENSITOMETR%' OR v.[Tipo Visita] LIKE '%DENSITOMETR%' THEN 'DENSITOMETRIA'
        WHEN v.[Agenda] LIKE '%MAMO%' OR v.[Tipo Visita] LIKE '%MAMO%' THEN 'MAMOGRAFIA'
        WHEN v.[Agenda] LIKE '%(TAC)%' OR v.[Agenda] LIKE '%TOMOGRAF%' THEN 'TOMOGRAFIA'
        WHEN v.[Agenda] LIKE '%(ECO)%' OR v.[Agenda] LIKE '%ECOGRAF%' OR v.[Agenda] LIKE '%DOPPLER%' THEN 'ECOGRAFIA'
        ELSE 'RADIOLOGIA'
    END AS [Modalidad],
    COUNT(DISTINCT v.[idVisita]) AS [Estudios_Efectivos]
FROM [SALUS].[dbo].[VLISE_Visitas] v
WHERE CAST(v.[Fecha Visita] AS DATE) BETWEEN @FechaDesde AND @FechaHasta
  AND (v.[Agenda] LIKE '(ECO)%' OR v.[Agenda] LIKE '(RX)%' OR v.[Agenda] LIKE '(TAC)%' OR v.[Agenda] LIKE '(MAMO)%')
  AND v.[Tipo Visita] NOT LIKE '%CONTRASTE%'
  AND v.[Asistencia] IN ('Presente', 'Internado', 'Urgencia', 'Sobreturno')
GROUP BY 
    CASE 
        WHEN v.[Agenda] LIKE '%DENSITOMETR%' OR v.[Tipo Visita] LIKE '%DENSITOMETR%' THEN 'DENSITOMETRIA'
        WHEN v.[Agenda] LIKE '%MAMO%' OR v.[Tipo Visita] LIKE '%MAMO%' THEN 'MAMOGRAFIA'
        WHEN v.[Agenda] LIKE '%(TAC)%' OR v.[Agenda] LIKE '%TOMOGRAF%' THEN 'TOMOGRAFIA'
        WHEN v.[Agenda] LIKE '%(ECO)%' OR v.[Agenda] LIKE '%ECOGRAF%' OR v.[Agenda] LIKE '%DOPPLER%' THEN 'ECOGRAFIA'
        ELSE 'RADIOLOGIA'
    END
ORDER BY [Estudios_Efectivos] DESC;`,
            explicacion_query: `### Clasificación Estandarizada en 5 Modalidades
1. **Unificación de Agendas**: Agrupa todas las agendas de imágenes en las 5 especialidades troncales: Ecografía, Radiología, Mamografía, Tomografía y Densitometría Ósea.
2. **Criterio de Estudio Efectivo**: Contabiliza turnos con estado confirmado (\`Presente\`, \`Internado\`, \`Urgencia\`, \`Sobreturno\`), separándolos de las ausencias para reflejar la producción real de los equipos.`,
            estado: 'Finalizado'
        },
        {
            titulo: 'Depuración Algorítmica de Tomografía Computada (Exclusión de Contrastes)',
            informacion_buscada: 'Aplicación de la regla de negocio forense que identifica y excluye los registros administrativos de inyección de medio de contraste oral o endovenoso en las agendas de Tomografía Computada, evitando duplicar el conteo de pacientes tomografiados.',
            origen_informacion: 'SALUS: [VLISE_Visitas] y [VLISE_PeticionesPruebasRadiologia]',
            ciclo_datos: 'Continuo en Extracción ETL',
            query_sql: `-- AUDITORÍA DE TOMOGRAFÍA COMPUTADA PURA VS ÍTEMS DE MEDIO DE CONTRASTE EXCLUIDOS
DECLARE @FechaDesde DATE = '2026-10-01';
DECLARE @FechaHasta DATE = '2026-10-31';

SELECT 
    v.[Agenda],
    SUM(CASE WHEN v.[Tipo Visita] NOT LIKE '%CONTRASTE%' AND v.[Prestacion] NOT LIKE '%CONTRASTE%' THEN 1 ELSE 0 END) AS [Tomografias_Reales_Puras],
    SUM(CASE WHEN v.[Tipo Visita] LIKE '%CONTRASTE%' OR v.[Prestacion] LIKE '%CONTRASTE%' THEN 1 ELSE 0 END) AS [Items_Contraste_Excluidos],
    COUNT(*) AS [Total_Registros_Brutos]
FROM [SALUS].[dbo].[VLISE_Visitas] v
WHERE CAST(v.[Fecha Visita] AS DATE) BETWEEN @FechaDesde AND @FechaHasta
  AND (v.[Agenda] LIKE '(TAC)%' OR v.[Agenda] LIKE '%TOMOGRAF%')
  AND v.[Asistencia] IN ('Presente', 'Internado', 'Urgencia', 'Sobreturno')
GROUP BY v.[Agenda]
ORDER BY [Tomografias_Reales_Puras] DESC;`,
            explicacion_query: `### Regla de Higiene de Datos en Tomografía
1. **Problema Resuelto**: En SALUS, cuando una Tomografía requiere contraste, suele generarse una línea adicional en la agenda para facturar el insumo/inyección de contraste.
2. **Solución Implementada**: El filtro excluye todo registro cuya prestación o tipo de visita contenga \`CONTRASTE\`, entregando el número exacto de estudios tomográficos reales (401 en Octubre 2026).`,
            estado: 'Finalizado'
        },
        {
            titulo: 'Tasa de Efectividad Asistencial, Ausentismo (No-Show) y Registros sin Cierre',
            informacion_buscada: 'Distribución completa de los turnos de Diagnóstico por Imágenes según su desenlace de asistencia: Presente, Internado, Urgencia, Sobreturno, Ausente (justificado/injustificado) y Sin Registrar, permitiendo auditar el ausentismo y la falta de cierre en recepción.',
            origen_informacion: 'SALUS: [VLISE_Visitas] (Columna Asistencia)',
            ciclo_datos: 'Diario / Mensual',
            query_sql: `-- MATRIZ DE ASISTENCIA, AUSENTISMO (NO-SHOW) Y PENDIENTES DE CIERRE EN IMÁGENES
SELECT 
    v.[Agenda],
    v.[Centro] AS [Sede],
    v.[Asistencia] AS [Estado_Original_SALUS],
    COUNT(*) AS [Cantidad_Turnos],
    CAST(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(PARTITION BY v.[Agenda]) AS DECIMAL(5,2)) AS [Porcentaje_Agenda]
FROM [SALUS].[dbo].[VLISE_Visitas] v
WHERE v.[Fecha Visita] >= '2026-10-01' AND v.[Fecha Visita] <= '2026-10-31 23:59:59'
  AND (v.[Agenda] LIKE '(ECO)%' OR v.[Agenda] LIKE '(RX)%' OR v.[Agenda] LIKE '(TAC)%' OR v.[Agenda] LIKE '(MAMO)%')
  AND v.[Tipo Visita] NOT LIKE '%CONTRASTE%'
GROUP BY v.[Agenda], v.[Centro], v.[Asistencia]
ORDER BY v.[Agenda], [Cantidad_Turnos] DESC;`,
            explicacion_query: `### Auditoría de Conversión de Agenda y No-Show
1. **Detección de Capacidad Ociosa**: Cuantifica las ausencias justificadas e injustificadas por agenda para ajustar estrategias de confirmación de turnos y asignación de sobreturnos.
2. **Higiene Administrativa**: Identifica turnos pasados que permanecieron en estado \`SIN REGISTRAR\` para su regularización en recepción.`,
            estado: 'Finalizado'
        },
        {
            titulo: 'Rendimiento Operativo por Agenda, Sala y Sede (Santa Fe, San Luis Sede 3, Mitre)',
            informacion_buscada: 'Comparativa volumétrica y de ámbito de atención (Ambulatorio vs Hospitalización) por cada equipo/agenda y por sede física de Sanatorio Argentino.',
            origen_informacion: 'SALUS: [VLISE_Visitas] (Columnas Agenda, Centro y Ámbito)',
            ciclo_datos: 'Mensual',
            query_sql: `-- RENDIMIENTO POR AGENDA, SEDE Y ÁMBITO (AMBULATORIO VS INTERNADO)
SELECT 
    v.[Centro] AS [Sede],
    v.[Agenda],
    CASE WHEN v.[Asistencia] = 'Internado' THEN 'Hospitalización' ELSE 'Ambulatorio' END AS [Ambito_Atencion],
    COUNT(*) AS [Cantidad_Estudios]
FROM [SALUS].[dbo].[VLISE_Visitas] v
WHERE v.[Fecha Visita] >= '2026-10-01' AND v.[Fecha Visita] <= '2026-10-31 23:59:59'
  AND (v.[Agenda] LIKE '(ECO)%' OR v.[Agenda] LIKE '(RX)%' OR v.[Agenda] LIKE '(TAC)%' OR v.[Agenda] LIKE '(MAMO)%')
  AND v.[Tipo Visita] NOT LIKE '%CONTRASTE%'
  AND v.[Asistencia] IN ('Presente', 'Internado', 'Urgencia', 'Sobreturno')
GROUP BY v.[Centro], v.[Agenda], CASE WHEN v.[Asistencia] = 'Internado' THEN 'Hospitalización' ELSE 'Ambulatorio' END
ORDER BY [Cantidad_Estudios] DESC;`,
            explicacion_query: `### Análisis de Capacidad por Sede y Equipo
1. **Desglose Territorial**: Permite comparar la carga operativa de Sede Santa Fe frente a San Luis Sede 3 y Consultorios Mitre.
2. **Carga de Internación vs Ambulatorio**: Mide qué proporción del uso de cada tomógrafo, ecógrafo o equipo de rayos corresponde a pacientes hospitalizados frente a turnos ambulatorios.`,
            estado: 'Finalizado'
        },
        {
            titulo: 'Productividad de Profesionales Realizadores e Informantes (SLA de Informes)',
            informacion_buscada: 'Ranking nominal de profesionales médicos y técnicos realizadores de estudios y médicos especialistas informantes, midiendo la cantidad de estudios con informe firmado frente a los estudios pendientes de informe.',
            origen_informacion: 'SALUS: [VLISE_Visitas] y [VLISE_PeticionesPruebasRadiologia]',
            ciclo_datos: 'Diario / Mensual',
            query_sql: `-- PRODUCTIVIDAD DE MÉDICOS INFORMANTES Y CONTROL DE ESTUDIOS PENDIENTES DE INFORME
SELECT 
    v.[Agenda],
    ISNULL(v.[PrestadorInforma], 'PENDIENTE DE FIRMA') AS [Medico_Informante],
    COUNT(*) AS [Total_Estudios_Atendidos],
    SUM(CASE WHEN v.[PrestadorInforma] IS NOT NULL AND v.[PrestadorInforma] <> '' THEN 1 ELSE 0 END) AS [Estudios_Informados],
    SUM(CASE WHEN v.[PrestadorInforma] IS NULL OR v.[PrestadorInforma] = '' THEN 1 ELSE 0 END) AS [Pendientes_De_Informe]
FROM [SALUS].[dbo].[VLISE_Visitas] v
WHERE v.[Fecha Visita] >= '2026-10-01' AND v.[Fecha Visita] <= '2026-10-31 23:59:59'
  AND (v.[Agenda] LIKE '(ECO)%' OR v.[Agenda] LIKE '(RX)%' OR v.[Agenda] LIKE '(TAC)%' OR v.[Agenda] LIKE '(MAMO)%')
  AND v.[Tipo Visita] NOT LIKE '%CONTRASTE%'
  AND v.[Asistencia] IN ('Presente', 'Internado', 'Urgencia', 'Sobreturno')
GROUP BY v.[Agenda], ISNULL(v.[PrestadorInforma], 'PENDIENTE DE FIRMA')
ORDER BY [Total_Estudios_Atendidos] DESC;`,
            explicacion_query: `### Control de Calidad y Entrega de Informes
1. **Trazabilidad de Firma Médica**: Identifica nominalmente al profesional que redactó y firmó cada estudio (ej. Dra. Laura Orozco Mercado, Dra. Cecilia Tello, Dra. Malvina Gómez).
2. **Alerta de Pendientes**: Cuantifica exactamente cuántos estudios realizados aún aguardan firma médica para asegurar el cumplimiento de plazos de entrega y facturación.`,
            estado: 'Finalizado'
        },
        {
            titulo: 'Ranking de Médicos Solicitantes / Derivadores al Servicio de Imágenes',
            informacion_buscada: 'Identificación nominal de los profesionales médicos (internos de consultorios/guardia y derivadores externos) que prescriben estudios de Ecografía, Radiología, Mamografía, Tomografía y Densitometría.',
            origen_informacion: 'SALUS: [VLISE_Visitas] (Columna MedicoSolicitante)',
            ciclo_datos: 'Mensual',
            query_sql: `-- RANKING DE MÉDICOS SOLICITANTES / PRESCRIPTORES DE ESTUDIOS DE IMÁGENES
SELECT 
    ISNULL(NULLIF(LTRIM(RTRIM(v.[MedicoSolicitante])), ''), 'DEMANDA ESPONTÁNEA / EXTERNO') AS [Medico_Solicitante],
    COUNT(*) AS [Estudios_Derivados]
FROM [SALUS].[dbo].[VLISE_Visitas] v
WHERE v.[Fecha Visita] >= '2026-10-01' AND v.[Fecha Visita] <= '2026-10-31 23:59:59'
  AND (v.[Agenda] LIKE '(ECO)%' OR v.[Agenda] LIKE '(RX)%' OR v.[Agenda] LIKE '(TAC)%' OR v.[Agenda] LIKE '(MAMO)%')
  AND v.[Tipo Visita] NOT LIKE '%CONTRASTE%'
  AND v.[Asistencia] IN ('Presente', 'Internado', 'Urgencia', 'Sobreturno')
GROUP BY ISNULL(NULLIF(LTRIM(RTRIM(v.[MedicoSolicitante])), ''), 'DEMANDA ESPONTÁNEA / EXTERNO')
ORDER BY [Estudios_Derivados] DESC;`,
            explicacion_query: `### Análisis de la Red de Derivación Médica
1. **Fidelización de Derivadores**: Permite conocer qué especialistas y servicios del Sanatorio Argentino generan el mayor flujo de estudios diagnósticos.
2. **Planificación Comercial y Operativa**: Facilita la coordinación de agendas dedicadas con los servicios de Ginecología, Obstetricia, Traumatología, Clínica Médica y Urología.`,
            estado: 'Finalizado'
        },
        {
            titulo: 'Distribución por Financiadores y Obras Sociales (Mix de Cobertura)',
            informacion_buscada: 'Participación volumétrica y porcentual de cada Obra Social, Prepaga o Paciente Particular sobre el total de estudios de Diagnóstico por Imágenes, cruzado con su comportamiento de asistencia.',
            origen_informacion: 'SALUS: [VLISE_Visitas] (Columna Cliente)',
            ciclo_datos: 'Mensual / Cierre de Facturación',
            query_sql: `-- DISTRIBUCIÓN DE ESTUDIOS DE IMÁGENES POR OBRA SOCIAL / FINANCIADOR
SELECT 
    v.[Cliente] AS [Obra_Social_Financiador],
    COUNT(CASE WHEN v.[Asistencia] IN ('Presente', 'Internado', 'Urgencia', 'Sobreturno') THEN 1 END) AS [Estudios_Efectivos],
    COUNT(CASE WHEN v.[Asistencia] LIKE 'Ausencia%' THEN 1 END) AS [Turnos_Ausentes],
    COUNT(*) AS [Total_Turnos]
FROM [SALUS].[dbo].[VLISE_Visitas] v
WHERE v.[Fecha Visita] >= '2026-10-01' AND v.[Fecha Visita] <= '2026-10-31 23:59:59'
  AND (v.[Agenda] LIKE '(ECO)%' OR v.[Agenda] LIKE '(RX)%' OR v.[Agenda] LIKE '(TAC)%' OR v.[Agenda] LIKE '(MAMO)%')
  AND v.[Tipo Visita] NOT LIKE '%CONTRASTE%'
GROUP BY v.[Cliente]
ORDER BY [Estudios_Efectivos] DESC;`,
            explicacion_query: `### Inteligencia de Convenios y Facturación
1. **Share por Financiador**: Cuantifica el peso de Obra Social Provincia (001), OSDE, DAMSU, Swiss Medical, Jerárquicos Salud y Particulares en cada modalidad.
2. **Control de Autorizaciones**: Cruza los estudios realizados por convenio con los informes firmados para acelerar el cierre de facturación mensual.`,
            estado: 'Finalizado'
        },
        {
            titulo: 'Articulación con Urgencias: Demanda de Imágenes desde Guardia Clínica',
            informacion_buscada: 'Trazabilidad de los estudios de Tomografía Computada, Radiología y Ecografía de urgencia solicitados a pacientes atendidos en Guardia Clínica dentro de las 24 horas de su arribo.',
            origen_informacion: 'SALUS: [VLISE_PeticionesPruebasRadiologia] cruzada con [VLISE_Visitas]',
            ciclo_datos: 'Diario / Mensual',
            query_sql: `-- ESTUDIOS DE IMÁGENES GENERADOS DESDE EL SERVICIO DE GUARDIA (VENTANA 24 HS)
SELECT 
    r.[TipoTarea] AS [Modalidad_Urgencia],
    COUNT(*) AS [Estudios_Solicitados_Guardia],
    COUNT(DISTINCT cg.[NHC]) AS [Pacientes_Estudiados]
FROM [SALUS].[dbo].[VLISE_Visitas] cg
INNER JOIN [SALUS].[dbo].[VLISE_PeticionesPruebasRadiologia] r
    ON cg.[NHC] = r.[NHC]
   AND r.[Fecha Solicitud] BETWEEN cg.[Fecha Entrada Real] AND DATEADD(HOUR, 24, cg.[Fecha Entrada Real])
WHERE cg.[Grupo Agenda] = 'GUARDIA CLINICA'
  AND cg.[Asistencia] = 'Presente'
  AND cg.[Fecha Visita] >= '2026-10-01'
  AND r.[Prueba] NOT LIKE '%CONTRASTE%'
GROUP BY r.[TipoTarea]
ORDER BY [Estudios_Solicitados_Guardia] DESC;`,
            explicacion_query: `### Sinergia Guardia - Diagnóstico por Imágenes
1. **Medición de Demanda Crítica**: Cuantifica la presión asistencial que la Guardia de Urgencias ejerce sobre el tomógrafo y la sala de rayos en cada turno.
2. **Optimización de Tiempos Diagnósticos**: Permite priorizar la firma de informes urgentes para agilizar la definición de alta o internación en guardia.`,
            estado: 'Finalizado'
        }
    ];

    if (!dxiInds || dxiInds.length === 0) {
        const rowsToInsert = dxiIndicatorsSpec.map(spec => ({
            proyecto_id: PROJECT_IDS.DXI,
            ...spec
        }));
        const { error: dxiInsErr } = await supabase
            .from('gobernanza_indicadores')
            .insert(rowsToInsert);
        if (dxiInsErr) throw dxiInsErr;
        console.log('   8 indicadores insertados para Diagnóstico por Imágenes (DxI) en estado Finalizado.');
    } else {
        for (const ind of dxiInds) {
            await supabase
                .from('gobernanza_indicadores')
                .update({ estado: 'Finalizado' })
                .eq('id', ind.id);
        }
        console.log('   Indicadores existentes de Diagnóstico por Imágenes marcados como Finalizado.');
    }

    // 5. Generar los 5 Documentos PDF Oficiales con la estética de Sanatorio Argentino y subirlos a Supabase
    console.log('5. Generando y subiendo los 5 Documentos PDF Oficiales a Supabase...');
    const docsDir = path.resolve('public/docs');
    if (!fs.existsSync(docsDir)) {
        fs.mkdirSync(docsDir, { recursive: true });
    }

    const servicesOrder = [
        { key: 'QUIROFANO', projectId: PROJECT_IDS.QUIROFANO, fileName: 'Dossier_Gobernanza_Quirofano_Sanatorio_Argentino.pdf' },
        { key: 'GUARDIA', projectId: PROJECT_IDS.GUARDIA, fileName: 'Dossier_Gobernanza_Guardia_Internado_Sanatorio_Argentino.pdf' },
        { key: 'UCI', projectId: PROJECT_IDS.UCI, fileName: 'Dossier_Gobernanza_Cuidados_Criticos_UCI_Sanatorio_Argentino.pdf' },
        { key: 'EPIDEMIOLOGIA', projectId: PROJECT_IDS.EPIDEMIOLOGIA, fileName: 'Dossier_Gobernanza_Vigilancia_Epidemiologica_Sanatorio_Argentino.pdf' },
        { key: 'DXI', projectId: PROJECT_IDS.DXI, fileName: 'Dossier_Gobernanza_Diagnostico_Imagenes_Sanatorio_Argentino.pdf' }
    ];

    for (const item of servicesOrder) {
        const { data: projInds } = await supabase
            .from('gobernanza_indicadores')
            .select('*')
            .eq('proyecto_id', item.projectId)
            .order('created_at', { ascending: true });

        const { doc } = buildGobernanzaServicePdfDoc(item.key, projInds, logoDataUrl);
        const arrayBuffer = doc.output('arraybuffer');
        const buffer = Buffer.from(arrayBuffer);

        // Guardar también en public/docs/ para acceso estático rápido
        const localFilePath = path.join(docsDir, item.fileName);
        fs.writeFileSync(localFilePath, buffer);

        // Subir a Supabase Storage bucket 'gobernanza_documentos'
        const storagePath = `${item.projectId}/oficial_${item.fileName}`;
        const { error: uploadErr } = await supabase.storage
            .from('gobernanza_documentos')
            .upload(storagePath, buffer, {
                contentType: 'application/pdf',
                upsert: true
            });

        let finalUrl = `/docs/${item.fileName}`;
        if (!uploadErr) {
            const { data: pubData } = supabase.storage
                .from('gobernanza_documentos')
                .getPublicUrl(storagePath);
            if (pubData?.publicUrl) {
                finalUrl = pubData.publicUrl;
            }
        } else {
            console.warn(`   Aviso al subir a storage (${item.key}):`, uploadErr.message, '-> Usando URL local /docs/');
        }

        // Verificar si ya existe el registro en gobernanza_documentos y actualizarlo o insertarlo
        const { data: existingDocs } = await supabase
            .from('gobernanza_documentos')
            .select('*')
            .eq('proyecto_id', item.projectId)
            .eq('nombre', item.fileName);

        if (existingDocs && existingDocs.length > 0) {
            await supabase
                .from('gobernanza_documentos')
                .update({
                    url: finalUrl,
                    tipo_archivo: 'application/pdf'
                })
                .eq('id', existingDocs[0].id);
        } else {
            const { error: docInsErr } = await supabase
                .from('gobernanza_documentos')
                .insert([{
                    proyecto_id: item.projectId,
                    nombre: item.fileName,
                    url: finalUrl,
                    tipo_archivo: 'application/pdf'
                }]);
            if (docInsErr) throw docInsErr;
        }

        console.log(`   [OK] PDF generado y vinculado (${buffer.length} bytes): ${item.fileName} -> ${finalUrl}`);
    }

    console.log('\n¡Sincronización de los 5 Proyectos de Gobernanza e Informes PDF completada con éxito!');
}

main().catch(err => {
    console.error('Error en sincronización:', err);
    process.exit(1);
});
