-- ====================================================================================================
-- SISTEMA DE GOBERNANZA CLÍNICA Y CALIDAD (QOAG) — SANATORIO ARGENTINO
-- INDICADORES DE GOBIERNO Y VIGILANCIA EPIDEMIOLÓGICA (SOLICITADOS POR DR. ROMANO)
-- ====================================================================================================
-- Servidor: 128.223.16.29:2450 | Base de Datos: SALUS | Motor: Transact-SQL
-- Propósito: Monitoreo epidemiológico obligatorio y consolidación de reportes mensuales para el
--            Ministerio de Salud / SNVS (Planillas C2 / Fichas Epidemiológicas).
-- Cobertura de Patologías:
--   1. Bronquiolitis aguda en lactantes y niños menores de 2 años (<24 meses).
--   2. Infecciones Respiratorias: ETI (Enfermedad Tipo Influenza / Gripe) y Neumonías.
--   3. Enfermedades Gastroentéricas: Diarreas Agudas e Infecciosas.
--   4. Enfermedades Eruptivas Inmunoprevenibles: Varicela.
--   5. Enfermedades de Transmisión Sexual (ETS / ITS): Sífilis, Gonorrea, VIH, Herpes, Clamidia, HPV.
-- ====================================================================================================

USE [SALUS];
GO

-- ====================================================================================================
-- 1. CONSULTA MAESTRA EPIDEMIOLÓGICA CONSOLIDADA (MENSUAL POR CENTRO Y GRUPO ETARIO)
-- ====================================================================================================
SELECT 
    FORMAT(t.[Fecha visita], 'yyyy-MM') AS [Mes],
    t.[Centro],
    CASE 
        WHEN t.[diagnostico] LIKE '%466.1%' OR t.[diagnostico] LIKE '%BRONQUIOLITIS%' 
             THEN 'Bronquiolitis (< 2 años)'
        WHEN t.[diagnostico] LIKE '%487%' OR t.[diagnostico] LIKE '%INFLUENZA%' OR t.[diagnostico] LIKE '%GRIPE%' 
             THEN 'ETI (Enfermedad Tipo Influenza)'
        WHEN t.[diagnostico] LIKE '%480%' OR t.[diagnostico] LIKE '%482%' OR t.[diagnostico] LIKE '%486%' OR t.[diagnostico] LIKE '%NEUMON%' 
             THEN 'Neumonía'
        WHEN t.[diagnostico] LIKE '%787.91%' OR t.[diagnostico] LIKE '%558%' OR t.[diagnostico] LIKE '%009%' OR t.[diagnostico] LIKE '%DIARREA%' OR t.[diagnostico] LIKE '%GASTROENT%' 
             THEN 'Gastroentérica: Diarrea Aguda'
        WHEN t.[diagnostico] LIKE '%052%' OR t.[diagnostico] LIKE '%VARICELA%' 
             THEN 'Varicela'
        WHEN t.[diagnostico] LIKE '%090%' OR t.[diagnostico] LIKE '%091%' OR t.[diagnostico] LIKE '%092%' OR t.[diagnostico] LIKE '%093%' OR t.[diagnostico] LIKE '%094%' OR t.[diagnostico] LIKE '%095%' OR t.[diagnostico] LIKE '%096%' OR t.[diagnostico] LIKE '%097%' OR t.[diagnostico] LIKE '%098%' OR t.[diagnostico] LIKE '%054.1%' OR t.[diagnostico] LIKE '%099%' OR t.[diagnostico] LIKE '%SIFILIS%' OR t.[diagnostico] LIKE '%GONOC%' OR t.[diagnostico] LIKE '%CLAMIDIA%' OR t.[diagnostico] LIKE '%VIH%' OR t.[diagnostico] LIKE '%CONDILOM%'
             THEN 'Enfermedades de Transmisión Sexual (ETS)'
        ELSE 'Otros'
    END AS [Grupo_Epidemiologico],
    COUNT(DISTINCT t.[IdVisita]) AS [Casos_Totales],
    COUNT(DISTINCT CASE WHEN DATEDIFF(MONTH, p.FechaNacimiento, t.[Fecha visita]) < 24 THEN t.[IdVisita] END) AS [Casos_Menores_2_Anios],
    COUNT(DISTINCT CASE WHEN DATEDIFF(YEAR, p.FechaNacimiento, t.[Fecha visita]) BETWEEN 2 AND 14 THEN t.[IdVisita] END) AS [Casos_Pediatricos_2_a_14],
    COUNT(DISTINCT CASE WHEN DATEDIFF(YEAR, p.FechaNacimiento, t.[Fecha visita]) >= 15 THEN t.[IdVisita] END) AS [Casos_Adultos]
FROM [SALUS].[dbo].[TABLEAU_Diagnosticos y motivo consulta] t
LEFT JOIN [SALUS].[dbo].[VLISE_DatosPaciente] p ON t.[NHC] = p.[NHC]
WHERE t.[Fecha visita] >= DATEADD(YEAR, -2, GETDATE())
  AND (
      -- Bronquiolitis solo en menores de 2 años (< 24 meses exactos a la consulta)
      ((t.[diagnostico] LIKE '%466.1%' OR t.[diagnostico] LIKE '%BRONQUIOLITIS%') AND DATEDIFF(MONTH, p.FechaNacimiento, t.[Fecha visita]) < 24)
      -- ETI y Neumonía
      OR (t.[diagnostico] LIKE '%487%' OR t.[diagnostico] LIKE '%INFLUENZA%' OR t.[diagnostico] LIKE '%GRIPE%')
      OR (t.[diagnostico] LIKE '%480%' OR t.[diagnostico] LIKE '%482%' OR t.[diagnostico] LIKE '%486%' OR t.[diagnostico] LIKE '%NEUMON%')
      -- Diarreas agudas
      OR (t.[diagnostico] LIKE '%787.91%' OR t.[diagnostico] LIKE '%558%' OR t.[diagnostico] LIKE '%009%' OR t.[diagnostico] LIKE '%DIARREA%' OR t.[diagnostico] LIKE '%GASTROENT%')
      -- Varicela
      OR (t.[diagnostico] LIKE '%052%' OR t.[diagnostico] LIKE '%VARICELA%')
      -- ETS
      OR (t.[diagnostico] LIKE '%090%' OR t.[diagnostico] LIKE '%091%' OR t.[diagnostico] LIKE '%092%' OR t.[diagnostico] LIKE '%093%' OR t.[diagnostico] LIKE '%094%' OR t.[diagnostico] LIKE '%095%' OR t.[diagnostico] LIKE '%096%' OR t.[diagnostico] LIKE '%097%' OR t.[diagnostico] LIKE '%098%' OR t.[diagnostico] LIKE '%054.1%' OR t.[diagnostico] LIKE '%099%' OR t.[diagnostico] LIKE '%SIFILIS%' OR t.[diagnostico] LIKE '%GONOC%' OR t.[diagnostico] LIKE '%CLAMIDIA%' OR t.[diagnostico] LIKE '%VIH%' OR t.[diagnostico] LIKE '%CONDILOM%')
  )
GROUP BY 
    FORMAT(t.[Fecha visita], 'yyyy-MM'),
    t.[Centro],
    CASE 
        WHEN t.[diagnostico] LIKE '%466.1%' OR t.[diagnostico] LIKE '%BRONQUIOLITIS%' THEN 'Bronquiolitis (< 2 años)'
        WHEN t.[diagnostico] LIKE '%487%' OR t.[diagnostico] LIKE '%INFLUENZA%' OR t.[diagnostico] LIKE '%GRIPE%' THEN 'ETI (Enfermedad Tipo Influenza)'
        WHEN t.[diagnostico] LIKE '%480%' OR t.[diagnostico] LIKE '%482%' OR t.[diagnostico] LIKE '%486%' OR t.[diagnostico] LIKE '%NEUMON%' THEN 'Neumonía'
        WHEN t.[diagnostico] LIKE '%787.91%' OR t.[diagnostico] LIKE '%558%' OR t.[diagnostico] LIKE '%009%' OR t.[diagnostico] LIKE '%DIARREA%' OR t.[diagnostico] LIKE '%GASTROENT%' THEN 'Gastroentérica: Diarrea Aguda'
        WHEN t.[diagnostico] LIKE '%052%' OR t.[diagnostico] LIKE '%VARICELA%' THEN 'Varicela'
        WHEN t.[diagnostico] LIKE '%090%' OR t.[diagnostico] LIKE '%091%' OR t.[diagnostico] LIKE '%092%' OR t.[diagnostico] LIKE '%093%' OR t.[diagnostico] LIKE '%094%' OR t.[diagnostico] LIKE '%095%' OR t.[diagnostico] LIKE '%096%' OR t.[diagnostico] LIKE '%097%' OR t.[diagnostico] LIKE '%098%' OR t.[diagnostico] LIKE '%054.1%' OR t.[diagnostico] LIKE '%099%' OR t.[diagnostico] LIKE '%SIFILIS%' OR t.[diagnostico] LIKE '%GONOC%' OR t.[diagnostico] LIKE '%CLAMIDIA%' OR t.[diagnostico] LIKE '%VIH%' OR t.[diagnostico] LIKE '%CONDILOM%' THEN 'Enfermedades de Transmisión Sexual (ETS)'
        ELSE 'Otros'
    END
ORDER BY [Mes] DESC, [Grupo_Epidemiologico];
GO

-- ====================================================================================================
-- 2. INDICADORES DESGLOSADOS POR PATOLOGÍA
-- ====================================================================================================

-- 2.1 BRONQUIOLITIS AGUDA EN MENORES DE 2 AÑOS
SELECT 
    FORMAT(t.[Fecha visita], 'yyyy-MM') AS [Mes],
    t.[Centro],
    COUNT(DISTINCT t.[IdVisita]) AS [Total_Casos_Bronquiolitis],
    AVG(DATEDIFF(MONTH, p.FechaNacimiento, t.[Fecha visita])) AS [Promedio_Meses_Vida]
FROM [SALUS].[dbo].[TABLEAU_Diagnosticos y motivo consulta] t
INNER JOIN [SALUS].[dbo].[VLISE_DatosPaciente] p ON t.[NHC] = p.[NHC]
WHERE t.[Fecha visita] >= DATEADD(YEAR, -2, GETDATE())
  AND (t.[diagnostico] LIKE '%466.1%' OR t.[diagnostico] LIKE '%BRONQUIOLITIS%')
  AND DATEDIFF(MONTH, p.FechaNacimiento, t.[Fecha visita]) < 24
GROUP BY FORMAT(t.[Fecha visita], 'yyyy-MM'), t.[Centro]
ORDER BY [Mes] DESC;
GO

-- 2.2 INFECCIONES RESPIRATORIAS AGUDAS: ETI Y NEUMONÍA
SELECT 
    FORMAT(t.[Fecha visita], 'yyyy-MM') AS [Mes],
    t.[Centro],
    CASE 
        WHEN t.[diagnostico] LIKE '%487%' OR t.[diagnostico] LIKE '%INFLUENZA%' OR t.[diagnostico] LIKE '%GRIPE%' THEN 'ETI (Influenza)'
        ELSE 'Neumonía'
    END AS [Tipo_Patologia],
    COUNT(DISTINCT t.[IdVisita]) AS [Casos_Totales],
    COUNT(DISTINCT CASE WHEN DATEDIFF(YEAR, p.FechaNacimiento, t.[Fecha visita]) < 15 THEN t.[IdVisita] END) AS [Pediatricos],
    COUNT(DISTINCT CASE WHEN DATEDIFF(YEAR, p.FechaNacimiento, t.[Fecha visita]) >= 15 THEN t.[IdVisita] END) AS [Adultos]
FROM [SALUS].[dbo].[TABLEAU_Diagnosticos y motivo consulta] t
LEFT JOIN [SALUS].[dbo].[VLISE_DatosPaciente] p ON t.[NHC] = p.[NHC]
WHERE t.[Fecha visita] >= DATEADD(YEAR, -2, GETDATE())
  AND (
      t.[diagnostico] LIKE '%487%' OR t.[diagnostico] LIKE '%INFLUENZA%' OR t.[diagnostico] LIKE '%GRIPE%'
      OR t.[diagnostico] LIKE '%480%' OR t.[diagnostico] LIKE '%482%' OR t.[diagnostico] LIKE '%486%' OR t.[diagnostico] LIKE '%NEUMON%'
  )
GROUP BY 
    FORMAT(t.[Fecha visita], 'yyyy-MM'),
    t.[Centro],
    CASE 
        WHEN t.[diagnostico] LIKE '%487%' OR t.[diagnostico] LIKE '%INFLUENZA%' OR t.[diagnostico] LIKE '%GRIPE%' THEN 'ETI (Influenza)'
        ELSE 'Neumonía'
    END
ORDER BY [Mes] DESC;
GO

-- 2.3 GASTROENTERITIS Y DIARREAS AGUDAS
SELECT 
    FORMAT(t.[Fecha visita], 'yyyy-MM') AS [Mes],
    t.[Centro],
    COUNT(DISTINCT t.[IdVisita]) AS [Total_Casos_Diarrea],
    COUNT(DISTINCT CASE WHEN DATEDIFF(MONTH, p.FechaNacimiento, t.[Fecha visita]) < 24 THEN t.[IdVisita] END) AS [Lactantes_Menores_2_Anios],
    COUNT(DISTINCT CASE WHEN DATEDIFF(YEAR, p.FechaNacimiento, t.[Fecha visita]) BETWEEN 2 AND 14 THEN t.[IdVisita] END) AS [Pediatricos_2_a_14],
    COUNT(DISTINCT CASE WHEN DATEDIFF(YEAR, p.FechaNacimiento, t.[Fecha visita]) >= 15 THEN t.[IdVisita] END) AS [Adultos]
FROM [SALUS].[dbo].[TABLEAU_Diagnosticos y motivo consulta] t
LEFT JOIN [SALUS].[dbo].[VLISE_DatosPaciente] p ON t.[NHC] = p.[NHC]
WHERE t.[Fecha visita] >= DATEADD(YEAR, -2, GETDATE())
  AND (t.[diagnostico] LIKE '%787.91%' OR t.[diagnostico] LIKE '%558%' OR t.[diagnostico] LIKE '%009%' OR t.[diagnostico] LIKE '%DIARREA%' OR t.[diagnostico] LIKE '%GASTROENT%')
GROUP BY FORMAT(t.[Fecha visita], 'yyyy-MM'), t.[Centro]
ORDER BY [Mes] DESC;
GO

-- 2.4 VIGILANCIA DE VARICELA
SELECT 
    FORMAT(t.[Fecha visita], 'yyyy-MM') AS [Mes],
    t.[Centro],
    COUNT(DISTINCT t.[IdVisita]) AS [Total_Casos_Varicela],
    COUNT(DISTINCT CASE WHEN DATEDIFF(YEAR, p.FechaNacimiento, t.[Fecha visita]) < 15 THEN t.[IdVisita] END) AS [Pediatricos],
    COUNT(DISTINCT CASE WHEN DATEDIFF(YEAR, p.FechaNacimiento, t.[Fecha visita]) >= 15 THEN t.[IdVisita] END) AS [Adultos]
FROM [SALUS].[dbo].[TABLEAU_Diagnosticos y motivo consulta] t
LEFT JOIN [SALUS].[dbo].[VLISE_DatosPaciente] p ON t.[NHC] = p.[NHC]
WHERE t.[Fecha visita] >= DATEADD(YEAR, -2, GETDATE())
  AND (t.[diagnostico] LIKE '%052%' OR t.[diagnostico] LIKE '%VARICELA%')
GROUP BY FORMAT(t.[Fecha visita], 'yyyy-MM'), t.[Centro]
ORDER BY [Mes] DESC;
GO

-- 2.5 ENFERMEDADES DE TRANSMISIÓN SEXUAL (ETS / ITS)
SELECT 
    FORMAT(t.[Fecha visita], 'yyyy-MM') AS [Mes],
    t.[Centro],
    CASE 
        WHEN t.[diagnostico] LIKE '%090%' OR t.[diagnostico] LIKE '%091%' OR t.[diagnostico] LIKE '%092%' OR t.[diagnostico] LIKE '%093%' OR t.[diagnostico] LIKE '%094%' OR t.[diagnostico] LIKE '%095%' OR t.[diagnostico] LIKE '%096%' OR t.[diagnostico] LIKE '%097%' OR t.[diagnostico] LIKE '%SIFILIS%' THEN 'Sífilis'
        WHEN t.[diagnostico] LIKE '%098%' OR t.[diagnostico] LIKE '%GONOC%' THEN 'Gonococia / Gonorrea'
        WHEN t.[diagnostico] LIKE '%042%' OR t.[diagnostico] LIKE '%VIH%' THEN 'VIH / SIDA'
        WHEN t.[diagnostico] LIKE '%054.1%' THEN 'Herpes Genital'
        WHEN t.[diagnostico] LIKE '%099%' OR t.[diagnostico] LIKE '%CLAMIDIA%' THEN 'Clamidia / Otras ETS'
        WHEN t.[diagnostico] LIKE '%078.11%' OR t.[diagnostico] LIKE '%CONDILOM%' THEN 'Condiloma / HPV Genital'
        ELSE 'Otra ETS'
    END AS [Patologia_ETS],
    COUNT(DISTINCT t.[IdVisita]) AS [Casos_Confirmados]
FROM [SALUS].[dbo].[TABLEAU_Diagnosticos y motivo consulta] t
WHERE t.[Fecha visita] >= DATEADD(YEAR, -2, GETDATE())
  AND (
      t.[diagnostico] LIKE '%090%' OR t.[diagnostico] LIKE '%091%' OR t.[diagnostico] LIKE '%092%' OR t.[diagnostico] LIKE '%093%' OR t.[diagnostico] LIKE '%094%' OR t.[diagnostico] LIKE '%095%' OR t.[diagnostico] LIKE '%096%' OR t.[diagnostico] LIKE '%097%' OR t.[diagnostico] LIKE '%098%' OR t.[diagnostico] LIKE '%054.1%' OR t.[diagnostico] LIKE '%099%' OR t.[diagnostico] LIKE '%SIFILIS%' OR t.[diagnostico] LIKE '%GONOC%' OR t.[diagnostico] LIKE '%CLAMIDIA%' OR t.[diagnostico] LIKE '%VIH%' OR t.[diagnostico] LIKE '%CONDILOM%'
  )
GROUP BY 
    FORMAT(t.[Fecha visita], 'yyyy-MM'),
    t.[Centro],
    CASE 
        WHEN t.[diagnostico] LIKE '%090%' OR t.[diagnostico] LIKE '%091%' OR t.[diagnostico] LIKE '%092%' OR t.[diagnostico] LIKE '%093%' OR t.[diagnostico] LIKE '%094%' OR t.[diagnostico] LIKE '%095%' OR t.[diagnostico] LIKE '%096%' OR t.[diagnostico] LIKE '%097%' OR t.[diagnostico] LIKE '%SIFILIS%' THEN 'Sífilis'
        WHEN t.[diagnostico] LIKE '%098%' OR t.[diagnostico] LIKE '%GONOC%' THEN 'Gonococia / Gonorrea'
        WHEN t.[diagnostico] LIKE '%042%' OR t.[diagnostico] LIKE '%VIH%' THEN 'VIH / SIDA'
        WHEN t.[diagnostico] LIKE '%054.1%' THEN 'Herpes Genital'
        WHEN t.[diagnostico] LIKE '%099%' OR t.[diagnostico] LIKE '%CLAMIDIA%' THEN 'Clamidia / Otras ETS'
        WHEN t.[diagnostico] LIKE '%078.11%' OR t.[diagnostico] LIKE '%CONDILOM%' THEN 'Condiloma / HPV Genital'
        ELSE 'Otra ETS'
    END
ORDER BY [Mes] DESC;
GO
