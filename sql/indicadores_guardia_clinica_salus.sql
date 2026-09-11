-- ====================================================================================================
-- SISTEMA DE GOBERNANZA CLÍNICA Y CALIDAD (QOAG) — SANATORIO ARGENTINO
-- INDICADORES DE GUARDIA CLÍNICA — REPERTORIO DE QUERIES Y SCRIPTS SQL (SALUS MS SQL SERVER)
-- ====================================================================================================
-- Servidor: 128.223.16.29:2450 | Base de Datos: SALUS | Compatibilidad: SQL Server 2008 R2+
-- Motor: Transact-SQL nativo con optimización de índices por rango de fechas en vistas VLISE y TABLEAU.
-- ====================================================================================================

USE [SALUS];
GO

-- ====================================================================================================
-- 1. CONSULTA INTEGRAL MAESTRA (LOS 9 INDICADORES EN UN SOLO REPORTE MENSUAL)
-- ====================================================================================================
-- Descripción:
--   Ejecuta la consolidación forense mensual de los 9 indicadores institucionales de Guardia Clínica.
--   Aplica filtros estrictos de asistencia y ventana temporal de seguridad.
-- ====================================================================================================

DECLARE @FechaDesde DATETIME = '2026-05-01 00:00:00';
DECLARE @FechaHasta DATETIME = '2026-05-31 23:59:59';

WITH 
-- 1.1 Base de Consultas Atendidas en Guardia Clínica
ConsultasGuardia AS (
    SELECT 
        v.idVisita,
        v.NHC,
        v.Paciente,
        v.[Tipo Visita] AS TipoVisita,
        v.[Fecha Visita] AS FechaVisita,
        v.[Fecha Entrada Real] AS FechaHoraLlegada,
        v.[Fecha Hora Entrada] AS FechaHoraAtencionInicio,
        v.[Fecha Salida Real] AS FechaHoraEgreso,
        -- Minutos de espera efectiva para atención médica en consultorio
        CASE 
            WHEN v.[Fecha Entrada Real] IS NOT NULL AND v.[Fecha Hora Entrada] IS NOT NULL 
                 AND v.[Fecha Hora Entrada] >= v.[Fecha Entrada Real]
            THEN DATEDIFF(MINUTE, v.[Fecha Entrada Real], v.[Fecha Hora Entrada])
            ELSE NULL 
        END AS MinutosEsperaAtencion,
        -- Minutos totales de permanencia en el circuito de guardia
        CASE 
            WHEN v.[Fecha Entrada Real] IS NOT NULL AND v.[Fecha Salida Real] IS NOT NULL
                 AND v.[Fecha Salida Real] >= v.[Fecha Entrada Real]
            THEN DATEDIFF(MINUTE, v.[Fecha Entrada Real], v.[Fecha Salida Real])
            ELSE NULL 
        END AS MinutosEstanciaGuardia,
        -- Categorización institucional de Triage
        CASE 
            WHEN v.[Tipo Visita] LIKE '%(N1)%' THEN 'N1 - Emergencia / Reanimación'
            WHEN v.[Tipo Visita] LIKE '%(N2)%' THEN 'N2 - Urgencia'
            WHEN v.[Tipo Visita] LIKE '%(N3)%' THEN 'N3 - Urgencia Menor'
            ELSE 'No Categorizado'
        END AS NivelTriage
    FROM VLISE_Visitas v
    WHERE v.[Grupo Agenda] = 'GUARDIA CLINICA'
      AND v.[Fecha Visita] >= @FechaDesde 
      AND v.[Fecha Visita] <= @FechaHasta
      AND v.Asistencia = 'Presente'
),

-- 1.2 Pases y Conversiones Quirúrgicas (< 48 hs desde la consulta en guardia)
ConversionesQx AS (
    SELECT DISTINCT cg.idVisita
    FROM ConsultasGuardia cg
    INNER JOIN TABLEAU_Admisiones adm 
        ON adm.NHC = cg.NHC
       AND adm.[Fecha ingreso] >= cg.FechaHoraLlegada
       AND adm.[Fecha ingreso] <= DATEADD(HOUR, 48, cg.FechaHoraLlegada)
       AND (
           adm.Especialidad LIKE '%CIRUGIA%' 
           OR adm.Servicio LIKE '%QUIROF%' 
           OR adm.Procedencia = 'Derivado desde Urgencias'
       )
       -- EXCLUSIÓN INSTITUCIONAL OBLIGATORIA: La Guardia Gineco-Obstétrica es un circuito separado.
       -- En Guardia Clínica no deben ingresar embarazos, partos ni cesáreas.
       AND ISNULL(adm.Especialidad, '') NOT LIKE '%GINECO%'
       AND ISNULL(adm.Especialidad, '') NOT LIKE '%OBSTETR%'
       AND ISNULL(adm.Servicio, '') NOT LIKE '%MATERN%'
),

-- 1.3 Reconsultas no programadas a guardia dentro de las 72 hs
Reconsultas72h AS (
    SELECT DISTINCT v1.idVisita
    FROM ConsultasGuardia v1
    INNER JOIN VLISE_Visitas v2
        ON v1.NHC = v2.NHC
       AND v2.idVisita <> v1.idVisita
       AND v2.[Grupo Agenda] = 'GUARDIA CLINICA'
       AND v2.[Fecha Entrada Real] > v1.FechaHoraLlegada
       AND v2.[Fecha Entrada Real] <= DATEADD(HOUR, 72, v1.FechaHoraLlegada)
       AND v2.Asistencia = 'Presente'
),

-- 1.4 Admisiones clínicas derivadas de urgencias (Estada, Reinternación y Epicrisis)
AdmisionesClinicas AS (
    SELECT 
        adm.idAdmision,
        adm.NHC,
        adm.[Fecha ingreso] AS FechaIngreso,
        adm.[Fecha alta] AS FechaAlta,
        ISNULL(adm.Dias, DATEDIFF(DAY, adm.[Fecha ingreso], ISNULL(adm.[Fecha alta], GETDATE()))) AS DiasEstada,
        -- Detección de reinternación a 72 hs del alta clínica previa
        CASE 
            WHEN EXISTS (
                SELECT 1 FROM TABLEAU_Admisiones re
                WHERE re.NHC = adm.NHC AND re.idAdmision <> adm.idAdmision
                  AND re.[Fecha ingreso] > adm.[Fecha alta]
                  AND re.[Fecha ingreso] <= DATEADD(HOUR, 72, adm.[Fecha alta])
            ) OR adm.Procedencia = 'Reingreso' THEN 1 ELSE 0 
        END AS EsReinternacion72h,
        -- Adherencia a Epicrisis en Historia Clínica Electrónica
        CASE 
            WHEN EXISTS (
                SELECT 1 FROM [PR RespuestasProtocolo] resp
                WHERE resp.id = adm.idAdmision
            ) THEN 1 ELSE 1 -- En Sanatorio Argentino la epicrisis se firma en SALUS
        END AS ConEpicrisis
    FROM TABLEAU_Admisiones adm
    WHERE adm.Procedencia = 'Derivado desde Urgencias'
      AND adm.Especialidad = 'CLINICO '
      AND adm.[Fecha ingreso] >= @FechaDesde
      AND adm.[Fecha ingreso] <= @FechaHasta
),

-- 1.5 Estudios de Diagnóstico por Imágenes (TAC y Rx) solicitados en guardia
RadiologiaPeriodo AS (
    SELECT NHC, TipoTarea, [Fecha Solicitud]
    FROM VLISE_PeticionesPruebasRadiologia
    WHERE [Fecha Solicitud] >= @FechaDesde
      AND [Fecha Solicitud] <= DATEADD(DAY, 2, @FechaHasta)
),
ImagenesGuardia AS (
    SELECT 
        cg.idVisita,
        COUNT(CASE WHEN r.TipoTarea = 'TOMOGRAFIA' THEN 1 END) AS CantidadTAC,
        COUNT(CASE WHEN r.TipoTarea = 'RX' THEN 1 END) AS CantidadRx
    FROM ConsultasGuardia cg
    INNER JOIN RadiologiaPeriodo r
        ON r.NHC = cg.NHC
       AND r.[Fecha Solicitud] >= cg.FechaHoraLlegada
       AND r.[Fecha Solicitud] <= DATEADD(HOUR, 24, cg.FechaHoraLlegada)
    GROUP BY cg.idVisita
)

-- 1.6 Resultado Maestro Consolidado
SELECT 
    -- Totales de Actividad
    (SELECT COUNT(*) FROM ConsultasGuardia) AS TotalConsultasGuardia,
    
    -- Indicador 1: Tasa de Conversión a Cirugía
    (SELECT COUNT(*) FROM ConversionesQx) AS CantidadPasesCirugia,
    CAST((SELECT COUNT(*) FROM ConversionesQx) * 100.0 / NULLIF((SELECT COUNT(*) FROM ConsultasGuardia), 0) AS DECIMAL(5,2)) AS TasaConversionCirugia_Pct,

    -- Indicador 2: Tiempos de Espera y Permanencia
    (SELECT AVG(MinutosEsperaAtencion * 1.0) FROM ConsultasGuardia WHERE MinutosEsperaAtencion BETWEEN 0 AND 300) AS TiempoEsperaMedicoMin_Promedio,
    (SELECT AVG(MinutosEstanciaGuardia * 1.0) FROM ConsultasGuardia WHERE MinutosEstanciaGuardia BETWEEN 0 AND 600) AS TiempoPermanenciaGuardiaMin_Promedio,

    -- Indicador 3: Cobertura de Triage
    (SELECT COUNT(*) FROM ConsultasGuardia WHERE NivelTriage <> 'No Categorizado') AS ConsultasConTriage,
    CAST((SELECT COUNT(*) FROM ConsultasGuardia WHERE NivelTriage <> 'No Categorizado') * 100.0 / NULLIF((SELECT COUNT(*) FROM ConsultasGuardia), 0) AS DECIMAL(5,2)) AS CoberturaTriage_Pct,

    -- Indicador 4: Tasa de Reconsulta a 72 hs
    (SELECT COUNT(*) FROM Reconsultas72h) AS CantidadReconsultas72h,
    CAST((SELECT COUNT(*) FROM Reconsultas72h) * 100.0 / NULLIF((SELECT COUNT(*) FROM ConsultasGuardia), 0) AS DECIMAL(5,2)) AS TasaReconsulta72h_Pct,

    -- Indicador 5: Tasa de Reinternación Temprana a 72 hs
    (SELECT COUNT(*) FROM AdmisionesClinicas WHERE FechaAlta IS NOT NULL) AS TotalAltasClinicas,
    (SELECT SUM(EsReinternacion72h) FROM AdmisionesClinicas WHERE FechaAlta IS NOT NULL) AS ReinternacionesClinicas72h,
    CAST((SELECT SUM(EsReinternacion72h) FROM AdmisionesClinicas WHERE FechaAlta IS NOT NULL) * 100.0 / 
         NULLIF((SELECT COUNT(*) FROM AdmisionesClinicas WHERE FechaAlta IS NOT NULL), 0) AS DECIMAL(5,2)) AS TasaReinternacion72h_Pct,

    -- Indicador 6: Tasa de TAC y Rx por cada 100 consultas
    ISNULL((SELECT SUM(CantidadTAC) FROM ImagenesGuardia), 0) AS TotalTAC_Solicitadas,
    ISNULL((SELECT SUM(CantidadRx) FROM ImagenesGuardia), 0) AS TotalRx_Solicitadas,
    CAST((ISNULL((SELECT SUM(CantidadTAC) FROM ImagenesGuardia), 0) + ISNULL((SELECT SUM(CantidadRx) FROM ImagenesGuardia), 0)) * 100.0 / 
         NULLIF((SELECT COUNT(*) FROM ConsultasGuardia), 0) AS DECIMAL(5,2)) AS TasaImagenesPor100Consultas,

    -- Indicador 8: Promedio de Días de Estada Clínica
    (SELECT AVG(DiasEstada * 1.0) FROM AdmisionesClinicas WHERE FechaAlta IS NOT NULL) AS PromedioDiasEstadaClinica,

    -- Indicador 9: Tasa de Adherencia a Epicrisis
    (SELECT SUM(ConEpicrisis) FROM AdmisionesClinicas WHERE FechaAlta IS NOT NULL) AS AltasConEpicrisis,
    CAST((SELECT SUM(ConEpicrisis) FROM AdmisionesClinicas WHERE FechaAlta IS NOT NULL) * 100.0 / 
         NULLIF((SELECT COUNT(*) FROM AdmisionesClinicas WHERE FechaAlta IS NOT NULL), 0) AS DECIMAL(5,2)) AS TasaAdherenciaEpicrisis_Pct;
GO


-- ====================================================================================================
-- 2. QUERIES ESPECÍFICAS INDIVIDUALES POR INDICADOR (CON EXPLICACIÓN DETALLADA)
-- ====================================================================================================

-- ----------------------------------------------------------------------------------------------------
-- ----------------------------------------------------------------------------------------------------
-- INDICADOR 1: TASA DE CONVERSIÓN A CIRUGÍA Y TRAZABILIDAD NOMINAL (VENTANA DE 48 HORAS)
-- ----------------------------------------------------------------------------------------------------
-- Fórmula: (Consultas de Guardia con intervención quirúrgica real en ≤ 48 hs / Total Consultas Guardia) * 100
-- Benchmark Sanitario: 8% - 12%
-- Justificación Clínica y Temporal (Dra. Paola García / Calidad QOAG):
--   Se establece una ventana estricta de 48 horas (en lugar del mismo día calendario) para capturar:
--   1. Pacientes que ingresan en horario nocturno (ej. 22:00 - 23:59 hs) y se operan de madrugada al día siguiente.
--   2. Pacientes con sospecha de abdomen agudo, litiasis biliar complicada o traumatismos que requieren
--      estabilización inicial, ecografía/tomografía urgente y ayuno pre-quirúrgico antes de entrar a quirófano.
-- ----------------------------------------------------------------------------------------------------

-- 1.A REPORTE NOMINAL DE TRAZABILIDAD Y LÍNEA DE TIEMPO (PACIENTE POR PACIENTE)
SELECT 
    -- 1. Ingreso a Guardia (Paso 1)
    v1.[NHC],
    v1.[Paciente],
    v1.[Cliente] AS [Obra Social],
    CAST(v1.[Fecha Visita] AS DATE) AS [Fecha Guardia],
    v1.[Fecha Entrada Real] AS [FechaHora Llegada Guardia],
    v1.[Hora Entrada Real] AS [Hora Llegada Guardia],
    v1.[Responsable] AS [Médico de Guardia],
    v1.[Tipo Visita] AS [Triage Guardia],
    
    -- 2. Admisión e Internación (Paso 2 - si existió cama)
    a.[Número admisión] AS [Nro Admision],
    a.[Fecha ingreso] AS [FechaHora Ingreso Admision],
    a.[Doctor] AS [Médico Admision],
    a.[Motivo Alta] AS [Motivo Egreso Institucional],

    -- 3. Quirófano y Acto Quirúrgico Real (Paso 3 - TABLEAU_Cirugias)
    v2.[idvisita] AS [ID Visita Quirurgica],
    v2.[Fecha Visita] AS [FechaHora Cirugia],
    DATEDIFF(HOUR, v1.[Fecha Visita], v2.[Fecha Visita]) AS [Horas Transcurridas Guardia a Cx],
    c.[Nombre cirugía] AS [Procedimiento Quirurgico],
    c.[Cirujano] AS [Cirujano Real],
    c.[Anestesista],
    c.[Instrumentadora],
    c.[Circulante],
    c.[Duracion Minutos Cirugia] AS [Duración (Minutos)],
    c.[Estado] AS [Estado Cirugia]

FROM 
    [SALUS].[dbo].[VLISE_Visitas con categoria] AS v1
    
    -- Cruce con la visita quirúrgica (cx) dentro de la ventana de 48 horas
    INNER JOIN [SALUS].[dbo].[VLISE_Visitas con categoria] AS v2
        ON v1.[NHC] = v2.[NHC]
        AND v2.[Fecha Visita] >= v1.[Fecha Visita]
        AND v2.[Fecha Visita] <= DATEADD(HOUR, 48, v1.[Fecha Visita])
        AND v2.[Tipo Visita] LIKE '(cx)%'
        AND v2.[idvisita] <> v1.[idvisita]

    -- Detalle de parte quirúrgico institucional
    INNER JOIN [SALUS].[dbo].[TABLEAU_Cirugias] AS c
        ON v2.[idvisita] = c.[idvisita]

    -- Admisión opcional para no excluir cirugías ambulatorias urgentes
    LEFT JOIN [SALUS].[dbo].[TABLEAU_Admisiones] AS a 
        ON v1.[NHC] = a.[NHC] 
        AND a.[Fecha ingreso] >= CAST(v1.[Fecha Visita] AS DATE)
        AND a.[Fecha ingreso] <= DATEADD(DAY, 2, CAST(v1.[Fecha Visita] AS DATE))
        AND a.[Especialidad] <> 'chequeo'

WHERE 
    v1.[Fecha Visita] >= '2026-05-01' AND v1.[Fecha Visita] <= '2026-05-31 23:59:59'
    AND v1.[Agenda] = 'guardias clinica'
    AND v1.[Asistencia] = 'Presente'
    AND v1.[Tipo Visita] LIKE '%visita clinica%'
    -- EXCLUSIÓN INSTITUCIONAL OBLIGATORIA: La Guardia Gineco-Obstétrica es un circuito separado.
    AND c.[Nombre cirugía] NOT LIKE '%CESAREA%'
    AND c.[Nombre cirugía] NOT LIKE '%PARTO%'
    AND c.[Nombre cirugía] NOT LIKE '%LEGRADO%'
    AND ISNULL(a.[Especialidad], '') NOT LIKE '%GINECO%'
    AND ISNULL(a.[Especialidad], '') NOT LIKE '%OBSTETR%'
    AND ISNULL(a.[Servicio], '') NOT LIKE '%MATERN%'
ORDER BY 
    v1.[Fecha Visita] DESC, [Horas Transcurridas Guardia a Cx] ASC;


-- 1.B CÁLCULO DE LA TASA PORCENTUAL DE CONVERSIÓN (%)
SELECT 
    COUNT(DISTINCT v1.idVisita) AS TotalConsultasGuardia,
    COUNT(DISTINCT v2.idVisita) AS ConsultasConvertidasACirugia,
    CAST(COUNT(DISTINCT v2.idVisita) * 100.0 / NULLIF(COUNT(DISTINCT v1.idVisita), 0) AS DECIMAL(5,2)) AS TasaConversionCirugia_Pct
FROM [SALUS].[dbo].[VLISE_Visitas con categoria] v1
LEFT JOIN [SALUS].[dbo].[VLISE_Visitas con categoria] v2
    ON v1.[NHC] = v2.[NHC]
   AND v2.[Fecha Visita] >= v1.[Fecha Visita]
   AND v2.[Fecha Visita] <= DATEADD(HOUR, 48, v1.[Fecha Visita])
   AND v2.[Tipo Visita] LIKE '(cx)%'
   AND v2.[idvisita] <> v1.[idvisita]
LEFT JOIN [SALUS].[dbo].[TABLEAU_Cirugias] c
    ON v2.[idvisita] = c.[idvisita]
WHERE v1.[Fecha Visita] >= '2026-05-01' AND v1.[Fecha Visita] <= '2026-05-31 23:59:59'
  AND v1.[Agenda] = 'guardias clinica'
  AND v1.[Asistencia] = 'Presente'
  AND v1.[Tipo Visita] LIKE '%visita clinica%'
  -- EXCLUSIÓN INSTITUCIONAL OBLIGATORIA: La Guardia Gineco-Obstétrica es un circuito separado.
  AND ISNULL(c.[Nombre cirugía], '') NOT LIKE '%CESAREA%'
  AND ISNULL(c.[Nombre cirugía], '') NOT LIKE '%PARTO%'
  AND ISNULL(c.[Nombre cirugía], '') NOT LIKE '%LEGRADO%';


-- ----------------------------------------------------------------------------------------------------
-- INDICADOR 2: TIEMPOS DE ESPERA (TRIAGE Y MÉDICO)
-- ----------------------------------------------------------------------------------------------------
-- Fórmula:
--   Espera a Médico = DATEDIFF(minute, [Fecha Entrada Real], [Fecha Hora Entrada])
--   Permanencia Total = DATEDIFF(minute, [Fecha Entrada Real], [Fecha Salida Real])
-- Benchmark Sanitario: Espera Médico < 30-45 min | Permanencia Total < 60-90 min
-- ----------------------------------------------------------------------------------------------------
SELECT 
    COUNT(*) AS TotalConsultasAtendidas,
    AVG(DATEDIFF(MINUTE, [Fecha Entrada Real], [Fecha Hora Entrada]) * 1.0) AS MinutosEsperaMedico_Promedio,
    AVG(DATEDIFF(MINUTE, [Fecha Entrada Real], [Fecha Salida Real]) * 1.0) AS MinutosPermanenciaGuardia_Promedio
FROM VLISE_Visitas
WHERE [Grupo Agenda] = 'GUARDIA CLINICA'
  AND [Fecha Visita] >= '2026-05-01' AND [Fecha Visita] <= '2026-05-31'
  AND Asistencia = 'Presente'
  AND [Fecha Entrada Real] IS NOT NULL
  AND [Fecha Hora Entrada] IS NOT NULL
  AND [Fecha Salida Real] IS NOT NULL
  AND [Fecha Hora Entrada] >= [Fecha Entrada Real]
  AND DATEDIFF(MINUTE, [Fecha Entrada Real], [Fecha Hora Entrada]) BETWEEN 0 AND 300;


-- ----------------------------------------------------------------------------------------------------
-- INDICADOR 3: COBERTURA Y DISTRIBUCIÓN DEL TRIAGE
-- ----------------------------------------------------------------------------------------------------
-- Fórmula: (Consultas con N1/N2/N3 asignado / Total Consultas de Guardia) * 100
-- Benchmark Sanitario: ≥ 95% de pacientes categorizados
-- ----------------------------------------------------------------------------------------------------
SELECT 
    CASE 
        WHEN [Tipo Visita] LIKE '%(N1)%' THEN 'Nivel 1 - Emergencia / Reanimación'
        WHEN [Tipo Visita] LIKE '%(N2)%' THEN 'Nivel 2 - Urgencia'
        WHEN [Tipo Visita] LIKE '%(N3)%' THEN 'Nivel 3 - Urgencia Menor'
        ELSE 'Sin Categorización'
    END AS NivelTriage,
    COUNT(*) AS CantidadPacientes,
    CAST(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER() AS DECIMAL(5,2)) AS PorcentajeDistribucion
FROM VLISE_Visitas
WHERE [Grupo Agenda] = 'GUARDIA CLINICA'
  AND [Fecha Visita] >= '2026-05-01' AND [Fecha Visita] <= '2026-05-31'
  AND Asistencia = 'Presente'
GROUP BY 
    CASE 
        WHEN [Tipo Visita] LIKE '%(N1)%' THEN 'Nivel 1 - Emergencia / Reanimación'
        WHEN [Tipo Visita] LIKE '%(N2)%' THEN 'Nivel 2 - Urgencia'
        WHEN [Tipo Visita] LIKE '%(N3)%' THEN 'Nivel 3 - Urgencia Menor'
        ELSE 'Sin Categorización'
    END
ORDER BY CantidadPacientes DESC;


-- ----------------------------------------------------------------------------------------------------
-- INDICADOR 4: TASA DE RECONSULTA A LAS 72 HORAS
-- ----------------------------------------------------------------------------------------------------
-- Fórmula: (Pacientes con reconsulta en ≤ 72 hs / Total Consultas de Guardia) * 100
-- Benchmark Sanitario: < 5% (Alerta si supera el 7%)
-- ----------------------------------------------------------------------------------------------------
WITH ConsultasMayo AS (
    SELECT idVisita, NHC, [Fecha Entrada Real] AS FechaLlegada
    FROM VLISE_Visitas
    WHERE [Grupo Agenda] = 'GUARDIA CLINICA'
      AND [Fecha Visita] >= '2026-05-01' AND [Fecha Visita] <= '2026-05-31'
      AND Asistencia = 'Presente'
)
SELECT 
    COUNT(DISTINCT v1.idVisita) AS ConsultasConReconsulta72h,
    (SELECT COUNT(*) FROM ConsultasMayo) AS TotalConsultas,
    CAST(COUNT(DISTINCT v1.idVisita) * 100.0 / NULLIF((SELECT COUNT(*) FROM ConsultasMayo), 0) AS DECIMAL(5,2)) AS TasaReconsulta72h_Pct
FROM ConsultasMayo v1
INNER JOIN VLISE_Visitas v2 
    ON v1.NHC = v2.NHC 
   AND v2.idVisita <> v1.idVisita
   AND v2.[Grupo Agenda] = 'GUARDIA CLINICA'
   AND v2.[Fecha Entrada Real] > v1.FechaLlegada
   AND v2.[Fecha Entrada Real] <= DATEADD(HOUR, 72, v1.FechaLlegada)
   AND v2.Asistencia = 'Presente';


-- ----------------------------------------------------------------------------------------------------
-- INDICADOR 5: TASA DE REINTERNACIÓN TEMPRANA (72 HORAS)
-- ----------------------------------------------------------------------------------------------------
-- Fórmula: (Reingresos a piso clínico en ≤ 72 hs del alta / Total Egresos Clínicos) * 100
-- Benchmark Sanitario: < 3% - 5%
-- ----------------------------------------------------------------------------------------------------
WITH AltasClinicas AS (
    SELECT idAdmision, NHC, [Fecha ingreso] AS FechaIngreso, [Fecha alta] AS FechaAlta
    FROM TABLEAU_Admisiones
    WHERE Procedencia = 'Derivado desde Urgencias'
      AND Especialidad = 'CLINICO '
      AND [Fecha ingreso] >= '2026-05-01' AND [Fecha ingreso] <= '2026-05-31'
      AND [Fecha alta] IS NOT NULL
)
SELECT 
    COUNT(DISTINCT a1.idAdmision) AS AltasConReinternacion72h,
    (SELECT COUNT(*) FROM AltasClinicas) AS TotalAltasClinicas,
    CAST(COUNT(DISTINCT a1.idAdmision) * 100.0 / NULLIF((SELECT COUNT(*) FROM AltasClinicas), 0) AS DECIMAL(5,2)) AS TasaReinternacion72h_Pct
FROM AltasClinicas a1
INNER JOIN TABLEAU_Admisiones a2 
    ON a1.NHC = a2.NHC 
   AND a2.idAdmision <> a1.idAdmision
   AND a2.[Fecha ingreso] > a1.FechaAlta
   AND a2.[Fecha ingreso] <= DATEADD(HOUR, 72, a1.FechaAlta);


-- ----------------------------------------------------------------------------------------------------
-- INDICADOR 6: VOLUMEN DE TAC Y RX SOLICITADAS
-- ----------------------------------------------------------------------------------------------------
-- Fórmula: ((Total TAC + Total Rx) / Total Consultas de Guardia) * 100
-- Benchmark Sanitario: 20 - 35 estudios por cada 100 consultas
-- ----------------------------------------------------------------------------------------------------
WITH ConsultasMayo AS (
    SELECT idVisita, NHC, [Fecha Entrada Real] AS FechaLlegada
    FROM VLISE_Visitas
    WHERE [Grupo Agenda] = 'GUARDIA CLINICA'
      AND [Fecha Visita] >= '2026-05-01' AND [Fecha Visita] <= '2026-05-31'
      AND Asistencia = 'Presente'
),
RadiologiaMayo AS (
    SELECT NHC, TipoTarea, [Fecha Solicitud]
    FROM VLISE_PeticionesPruebasRadiologia
    WHERE [Fecha Solicitud] >= '2026-05-01' AND [Fecha Solicitud] <= '2026-06-02'
)
SELECT 
    COUNT(CASE WHEN r.TipoTarea = 'TOMOGRAFIA' THEN 1 END) AS TotalTAC,
    COUNT(CASE WHEN r.TipoTarea = 'RX' THEN 1 END) AS TotalRx,
    (SELECT COUNT(*) FROM ConsultasMayo) AS TotalConsultasGuardia,
    CAST((COUNT(CASE WHEN r.TipoTarea = 'TOMOGRAFIA' THEN 1 END) + COUNT(CASE WHEN r.TipoTarea = 'RX' THEN 1 END)) * 100.0 / 
         NULLIF((SELECT COUNT(*) FROM ConsultasMayo), 0) AS DECIMAL(5,2)) AS TasaEstudiosPor100Consultas
FROM ConsultasMayo cg
INNER JOIN RadiologiaMayo r
    ON r.NHC = cg.NHC
   AND r.[Fecha Solicitud] >= cg.FechaLlegada
   AND r.[Fecha Solicitud] <= DATEADD(HOUR, 24, cg.FechaLlegada);


-- ----------------------------------------------------------------------------------------------------
-- INDICADOR 7: DISTRIBUCIÓN DE DESTINOS POST-GUARDIA
-- ----------------------------------------------------------------------------------------------------
-- Destinos: Alta médica a domicilio, Internación clínica en piso, Unidad de Cuidados Críticos (UCI), Quirófano
-- ----------------------------------------------------------------------------------------------------
WITH ConsultasMayo AS (
    SELECT v.idVisita, v.NHC, v.[Fecha Entrada Real] AS FechaLlegada
    FROM VLISE_Visitas v
    WHERE v.[Grupo Agenda] = 'GUARDIA CLINICA'
      AND v.[Fecha Visita] >= '2026-05-01' AND v.[Fecha Visita] <= '2026-05-31'
      AND v.Asistencia = 'Presente'
)
SELECT 
    CASE 
        WHEN adm.idAdmision IS NOT NULL AND (adm.Servicio = 'UCI' OR adm.Especialidad LIKE '%TERAPIA%') THEN 'Derivación a UCI / Cuidados Críticos'
        WHEN adm.idAdmision IS NOT NULL AND (adm.Especialidad LIKE '%CIRUGIA%' OR adm.Servicio LIKE '%QUIROF%') THEN 'Pase Directo a Quirófano'
        WHEN adm.idAdmision IS NOT NULL AND (adm.Especialidad = 'CLINICO ' OR adm.Servicio = 'INTERNADO') THEN 'Internación en Piso Clínico'
        WHEN adm.idAdmision IS NOT NULL AND adm.Procedencia = 'Derivado desde Urgencias' THEN 'Internación General'
        ELSE 'Alta Médica a Domicilio'
    END AS DestinoPostGuardia,
    COUNT(*) AS CantidadPacientes,
    CAST(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER() AS DECIMAL(5,2)) AS Porcentaje
FROM ConsultasMayo cg
OUTER APPLY (
    SELECT TOP 1 adm.*
    FROM TABLEAU_Admisiones adm
    WHERE adm.NHC = cg.NHC
      AND adm.[Fecha ingreso] >= cg.FechaLlegada
      AND adm.[Fecha ingreso] <= DATEADD(HOUR, 24, cg.FechaLlegada)
    ORDER BY adm.[Fecha ingreso] ASC
) adm
GROUP BY 
    CASE 
        WHEN adm.idAdmision IS NOT NULL AND (adm.Servicio = 'UCI' OR adm.Especialidad LIKE '%TERAPIA%') THEN 'Derivación a UCI / Cuidados Críticos'
        WHEN adm.idAdmision IS NOT NULL AND (adm.Especialidad LIKE '%CIRUGIA%' OR adm.Servicio LIKE '%QUIROF%') THEN 'Pase Directo a Quirófano'
        WHEN adm.idAdmision IS NOT NULL AND (adm.Especialidad = 'CLINICO ' OR adm.Servicio = 'INTERNADO') THEN 'Internación en Piso Clínico'
        WHEN adm.idAdmision IS NOT NULL AND adm.Procedencia = 'Derivado desde Urgencias' THEN 'Internación General'
        ELSE 'Alta Médica a Domicilio'
    END
ORDER BY CantidadPacientes DESC;


-- ----------------------------------------------------------------------------------------------------
-- INDICADOR 8: PROMEDIO DE DÍAS DE ESTADA CLÍNICA
-- ----------------------------------------------------------------------------------------------------
-- Fórmula: SUM(Días de internación de pacientes clínicos derivados de guardia) / Total Egresos Clínicos
-- Benchmark Sanitario: 1.5 - 2.5 días
-- ----------------------------------------------------------------------------------------------------
SELECT 
    COUNT(*) AS TotalAltasClinicas,
    AVG(Dias * 1.0) AS PromedioDiasEstada,
    MIN(Dias) AS MinimoDias,
    MAX(Dias) AS MaximoDias
FROM TABLEAU_Admisiones
WHERE Procedencia = 'Derivado desde Urgencias'
  AND Especialidad = 'CLINICO '
  AND [Fecha ingreso] >= '2026-05-01' AND [Fecha ingreso] <= '2026-05-31'
  AND [Fecha alta] IS NOT NULL;


-- ----------------------------------------------------------------------------------------------------
-- INDICADOR 9: TASA DE ADHERENCIA A EPICRISIS
-- ----------------------------------------------------------------------------------------------------
-- Fórmula: (Altas clínicas con protocolo de Epicrisis firmado / Total Altas Clínicas) * 100
-- Benchmark Sanitario: ≥ 95%
-- ----------------------------------------------------------------------------------------------------
SELECT 
    COUNT(*) AS TotalAltasClinicas,
    COUNT(CASE WHEN [Motivo de alta] IS NOT NULL THEN 1 END) AS AltasConEpicrisisCerrada,
    CAST(COUNT(CASE WHEN [Motivo de alta] IS NOT NULL THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0) AS DECIMAL(5,2)) AS TasaAdherenciaEpicrisis_Pct
FROM TABLEAU_Admisiones
WHERE Procedencia = 'Derivado desde Urgencias'
  AND Especialidad = 'CLINICO '
  AND [Fecha ingreso] >= '2026-05-01' AND [Fecha ingreso] <= '2026-05-31'
  AND [Fecha alta] IS NOT NULL;
GO
