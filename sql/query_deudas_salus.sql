-- =====================================================
-- QUERY: Exportar Deudas desde SALUS (SQL Server)
-- =====================================================
-- Ejecutar en Microsoft SQL Server Management Studio
-- Exportar resultado como Excel (.xlsx)
-- Importar el Excel en ADM-QUI > Gestión de Deudas
-- =====================================================
-- Columnas esperadas por el parser (en este orden):
--   [0] Fecha albaran
--   [1] Paciente
--   [2] Paciente_NHC
--   [3] Paciente_NIF
--   [4] Tarifa
--   [5] Concepto
--   [6] Numero folio
--   [7] Cobrado linea
--   [8] Deuda linea
--   [9] Núm.Admisión
--   [10] HOSP_Habitacion
--   [11] telefono1_formateado
--   [12] email
-- =====================================================

SELECT TOP 1000
    T.[Fecha albaran],
    T.Paciente,
    T.Paciente_NHC,
    T.Paciente_NIF,
    T.Tarifa,
    T.Concepto,
    T.[Numero folio],
    T.[Cobrado linea],
    T.[Deuda linea],
    T.[Núm.Admisión],
    T.HOSP_Habitacion,
    CASE 
        WHEN V.telefono1 IS NOT NULL 
        THEN '549' + 
            REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
            REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
            REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
            REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
                LOWER(V.telefono1)
            , 'a', ''), 'b', ''), 'c', ''), 'd', ''), 'e', ''), 'f', ''), 'g', ''), 'h', ''), 'i', ''), 'j', '')
            , 'k', ''), 'l', ''), 'm', ''), 'n', ''), 'ñ', ''), 'o', ''), 'p', ''), 'q', ''), 'r', ''), 's', '')
            , 't', ''), 'u', ''), 'v', ''), 'w', ''), 'x', ''), 'y', ''), 'z', ''), 'á', ''), 'é', ''), 'í', '')
            , 'ó', ''), 'ú', ''), '-', ''), ' ', ''), '(', ''), ')', ''), '+', ''), '*', ''), '.', ''), ',', '')
        ELSE NULL
    END AS telefono1_formateado,
    V.email
FROM [TABLEAU_Detalle de ventas Facturadas con Gastos y Honorarios] AS T
LEFT JOIN VIS_Pacientes AS V 
    ON T.Paciente_NHC = V.NHC
WHERE T.Tarifa LIKE '042%'
  AND T.[Deuda linea] > 0
  AND T.[Numero folio] IS NOT NULL
  AND T.Paciente IS NOT NULL
  AND T.[Fecha albaran] >= '2025-05-01'
ORDER BY T.[Fecha albaran] DESC
