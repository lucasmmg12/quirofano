-- =========================================================================================
-- SANATORIO ARGENTINO · GOBERNANZA DE DATOS Y CALIDAD ASISTENCIAL (QOAG)
-- PROYECTO: CENTRO QUIRÚRGICO (QUIRÓFANO CENTRAL Q1-Q4 & HOSPITAL DE DÍA Q5-Q6)
-- MOTOR: Transact-SQL (T-SQL) · Servidor SALUS: 128.223.16.29:2450
-- REPOSITORIO MAESTRO DE CONSULTAS Y REGLAS DE NEGOCIO PARA INDICADORES
-- =========================================================================================

-- Parámetros de auditoría estándar para consultas:
-- DECLARE @FechaInicio DATETIME = '2026-05-01 00:00:00';
-- DECLARE @FechaFin DATETIME = '2026-05-31 23:59:59';

-- -----------------------------------------------------------------------------------------
-- INDICADOR 1: VOLUMEN DE CIRUGÍAS Y EVOLUCIÓN INTERANUAL (CENTRAL VS. HOSPITAL DE DÍA)
-- Qué mide: Total mensual de intervenciones quirúrgicas ejecutadas discriminando Quirófano Central vs HdD.
-- -----------------------------------------------------------------------------------------
SELECT 
    YEAR(pq.FechaCirugia) AS Anio,
    MONTH(pq.FechaCirugia) AS MesNumero,
    FORMAT(pq.FechaCirugia, 'yyyy-MM') AS Periodo,
    COUNT(DISTINCT pq.IdProtocolo) AS TotalCirugias,
    SUM(CASE WHEN sq.CodigoSala IN ('Q1', 'Q2', 'Q3', 'Q4') THEN 1 ELSE 0 END) AS QuirofanoCentral,
    SUM(CASE WHEN sq.CodigoSala IN ('Q5', 'Q6') THEN 1 ELSE 0 END) AS HospitalDeDia,
    SUM(CASE WHEN sq.CodigoSala LIKE '%PARTO%' THEN 1 ELSE 0 END) AS SalaPartos,
    ROUND(SUM(CASE WHEN sq.CodigoSala IN ('Q1', 'Q2', 'Q3', 'Q4') THEN 1 ELSE 0 END) * 100.0 / COUNT(DISTINCT pq.IdProtocolo), 2) AS PctCentral,
    ROUND(SUM(CASE WHEN sq.CodigoSala IN ('Q5', 'Q6') THEN 1 ELSE 0 END) * 100.0 / COUNT(DISTINCT pq.IdProtocolo), 2) AS PctHdD
FROM dbo.ProtocolosQuirurgicos pq
INNER JOIN dbo.SalasQuirurgicas sq ON pq.IdSala = sq.IdSala
WHERE pq.EstadoCirugia = 'Realizada'
  AND pq.FechaCirugia BETWEEN @FechaInicio AND @FechaFin
GROUP BY YEAR(pq.FechaCirugia), MONTH(pq.FechaCirugia), FORMAT(pq.FechaCirugia, 'yyyy-MM')
ORDER BY Anio DESC, MesNumero DESC;


-- -----------------------------------------------------------------------------------------
-- INDICADOR 2: TASA DE OCUPACIÓN POR SALA Y CAPACIDAD QUIRÚRGICA
-- Qué mide: Horas quirúrgicas efectivas vs horas habilitadas en ventana estándar 07:00 a 21:00 hs (14 hs/día).
-- -----------------------------------------------------------------------------------------
SELECT 
    sq.CodigoSala,
    sq.NombreSala,
    COUNT(DISTINCT pq.IdProtocolo) AS CantidadCirugias,
    ROUND(SUM(DATEDIFF(MINUTE, pq.HoraEntradaSala, pq.HoraSalidaSala)) / 60.0, 2) AS HorasEfectivasUso,
    -- Capacidad teórica mensual: 26 días hábiles x 14 horas = 364 horas disponibles
    364.0 AS HorasDisponiblesMes,
    ROUND((SUM(DATEDIFF(MINUTE, pq.HoraEntradaSala, pq.HoraSalidaSala)) / 60.0) * 100.0 / 364.0, 2) AS TasaOcupacionPct,
    ROUND(AVG(DATEDIFF(MINUTE, pq.HoraEntradaSala, pq.HoraSalidaSala)), 1) AS DuracionMediaMinutos
FROM dbo.SalasQuirurgicas sq
LEFT JOIN dbo.ProtocolosQuirurgicos pq 
    ON sq.IdSala = pq.IdSala 
   AND pq.EstadoCirugia = 'Realizada'
   AND pq.FechaCirugia BETWEEN @FechaInicio AND @FechaFin
GROUP BY sq.CodigoSala, sq.NombreSala
ORDER BY TasaOcupacionPct DESC;


-- -----------------------------------------------------------------------------------------
-- INDICADOR 3: TASA Y CLASIFICACIÓN DE SUSPENSIONES (EN EL DÍA VS. 24HS PREVIAS)
-- Qué mide: Porcentaje global de suspensiones separando cancelaciones intra-día (< 24h) de diferimientos tempranos.
-- -----------------------------------------------------------------------------------------
SELECT 
    FORMAT(tq.FechaProgramada, 'yyyy-MM') AS Mes,
    COUNT(*) AS TotalCirugiasAgendadas,
    SUM(CASE WHEN tq.Estado = 'Realizado' THEN 1 ELSE 0 END) AS Realizadas,
    SUM(CASE WHEN tq.Estado IN ('Suspendido', 'Cancelado') THEN 1 ELSE 0 END) AS SuspendidasTotales,
    ROUND(SUM(CASE WHEN tq.Estado IN ('Suspendido', 'Cancelado') THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) AS TasaSuspensionGlobal,
    SUM(CASE WHEN tq.Estado IN ('Suspendido', 'Cancelado') AND DATEDIFF(HOUR, tq.FechaCancelacion, tq.FechaProgramada) <= 24 THEN 1 ELSE 0 END) AS SuspEnElDia_Menor24h,
    SUM(CASE WHEN tq.Estado IN ('Suspendido', 'Cancelado') AND DATEDIFF(HOUR, tq.FechaCancelacion, tq.FechaProgramada) > 24 THEN 1 ELSE 0 END) AS SuspPrevia_Mayor24h,
    ROUND(SUM(CASE WHEN tq.Estado IN ('Suspendido', 'Cancelado') AND DATEDIFF(HOUR, tq.FechaCancelacion, tq.FechaProgramada) <= 24 THEN 1 ELSE 0 END) * 100.0 / 
          NULLIF(SUM(CASE WHEN tq.Estado IN ('Suspendido', 'Cancelado') THEN 1 ELSE 0 END), 0), 2) AS PctSuspEnElDia
FROM dbo.TurnosQuirurgicos tq
WHERE tq.FechaProgramada BETWEEN @FechaInicio AND @FechaFin
GROUP BY FORMAT(tq.FechaProgramada, 'yyyy-MM')
ORDER BY Mes DESC;


-- -----------------------------------------------------------------------------------------
-- INDICADOR 4: MATRIZ CAUSAL DE SUSPENSIÓN DE CIRUGÍAS (CATÁLOGO OFICIAL 1..13 DE TABLEAU)
-- Qué mide: Distribución de causales eliminando el causal ciego NULL y auditando responsabilidades.
-- -----------------------------------------------------------------------------------------
SELECT 
    CASE 
        WHEN ms.CodigoMotivo = 1 OR tq.MotivoSuspension LIKE '%reprogram%' THEN '1. Cx Reprogramada'
        WHEN ms.CodigoMotivo = 2 OR tq.MotivoSuspension LIKE '%obra social%' OR tq.MotivoSuspension LIKE '%autoriz%' THEN '2. No autorizada por Obra social'
        WHEN ms.CodigoMotivo = 3 OR tq.MotivoSuspension LIKE '%ya fue real%' THEN '3. Ya fue realizado'
        WHEN ms.CodigoMotivo = 4 OR tq.MotivoSuspension LIKE '%enfermo%' OR tq.MotivoSuspension LIKE '%fiebre%' THEN '4. Paciente enfermo'
        WHEN ms.CodigoMotivo = 5 OR tq.MotivoSuspension LIKE '%prequirurg%' THEN '5. Paciente sin prequirúrgicos'
        WHEN ms.CodigoMotivo = 6 OR tq.MotivoSuspension LIKE '%ayuno%' THEN '6. Paciente sin ayuno'
        WHEN ms.CodigoMotivo = 7 OR tq.MotivoSuspension LIKE '%otro motivo de paciente%' THEN '7. Otro motivo de paciente'
        WHEN ms.CodigoMotivo = 8 OR tq.MotivoSuspension LIKE '%cirujano%' THEN '8. Otro motivo de cirujanos'
        WHEN ms.CodigoMotivo = 9 OR tq.MotivoSuspension LIKE '%econ%' THEN '9. Motivos económicos'
        WHEN ms.CodigoMotivo = 10 OR tq.MotivoSuspension LIKE '%ortopedia%' OR tq.MotivoSuspension LIKE '%protesis%' THEN '10. Ortopedia / Prótesis'
        ELSE '13. Otros (edilicios/técnicos)'
    END AS CatalogoOficialMotivo,
    COUNT(*) AS CantidadSuspensiones,
    ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) AS PorcentajeDelTotal,
    SUM(CASE WHEN DATEDIFF(HOUR, tq.FechaCancelacion, tq.FechaProgramada) <= 24 THEN 1 ELSE 0 END) AS OcurridasEnElDia,
    SUM(CASE WHEN DATEDIFF(HOUR, tq.FechaCancelacion, tq.FechaProgramada) > 24 THEN 1 ELSE 0 END) AS OcurridasConAnticipacion
FROM dbo.TurnosQuirurgicos tq
LEFT JOIN dbo.MotivosSuspension ms ON tq.IdMotivoSuspension = ms.IdMotivo
WHERE tq.Estado IN ('Suspendido', 'Cancelado')
  AND tq.FechaProgramada BETWEEN @FechaInicio AND @FechaFin
GROUP BY 
    CASE 
        WHEN ms.CodigoMotivo = 1 OR tq.MotivoSuspension LIKE '%reprogram%' THEN '1. Cx Reprogramada'
        WHEN ms.CodigoMotivo = 2 OR tq.MotivoSuspension LIKE '%obra social%' OR tq.MotivoSuspension LIKE '%autoriz%' THEN '2. No autorizada por Obra social'
        WHEN ms.CodigoMotivo = 3 OR tq.MotivoSuspension LIKE '%ya fue real%' THEN '3. Ya fue realizado'
        WHEN ms.CodigoMotivo = 4 OR tq.MotivoSuspension LIKE '%enfermo%' OR tq.MotivoSuspension LIKE '%fiebre%' THEN '4. Paciente enfermo'
        WHEN ms.CodigoMotivo = 5 OR tq.MotivoSuspension LIKE '%prequirurg%' THEN '5. Paciente sin prequirúrgicos'
        WHEN ms.CodigoMotivo = 6 OR tq.MotivoSuspension LIKE '%ayuno%' THEN '6. Paciente sin ayuno'
        WHEN ms.CodigoMotivo = 7 OR tq.MotivoSuspension LIKE '%otro motivo de paciente%' THEN '7. Otro motivo de paciente'
        WHEN ms.CodigoMotivo = 8 OR tq.MotivoSuspension LIKE '%cirujano%' THEN '8. Otro motivo de cirujanos'
        WHEN ms.CodigoMotivo = 9 OR tq.MotivoSuspension LIKE '%econ%' THEN '9. Motivos económicos'
        WHEN ms.CodigoMotivo = 10 OR tq.MotivoSuspension LIKE '%ortopedia%' OR tq.MotivoSuspension LIKE '%protesis%' THEN '10. Ortopedia / Prótesis'
        ELSE '13. Otros (edilicios/técnicos)'
    END
ORDER BY CantidadSuspensiones DESC;


-- -----------------------------------------------------------------------------------------
-- INDICADOR 5: RENDIMIENTO Y TASA DE SUSPENSIÓN RELATIVA POR CIRUJANO
-- Qué mide: Ratio relativo de suspensiones sobre el total de cirugías agendadas por cada médico, aislando el sesgo de volumen.
-- -----------------------------------------------------------------------------------------
SELECT 
    med.NombreCompleto AS Cirujano,
    esp.Nombre AS Especialidad,
    COUNT(tq.IdTurno) AS CirugiasAgendadas,
    SUM(CASE WHEN tq.Estado = 'Realizado' THEN 1 ELSE 0 END) AS CirugiasRealizadas,
    SUM(CASE WHEN tq.Estado IN ('Suspendido', 'Cancelado') THEN 1 ELSE 0 END) AS CirugiasSuspendidas,
    ROUND(SUM(CASE WHEN tq.Estado = 'Realizado' THEN 1 ELSE 0 END) * 100.0 / 
          SUM(SUM(CASE WHEN tq.Estado = 'Realizado' THEN 1 ELSE 0 END)) OVER(), 2) AS PctAporteVolumenSanatorio,
    ROUND(SUM(CASE WHEN tq.Estado IN ('Suspendido', 'Cancelado') THEN 1 ELSE 0 END) * 100.0 / COUNT(tq.IdTurno), 2) AS TasaSuspensionRelativa
FROM dbo.TurnosQuirurgicos tq
INNER JOIN dbo.Medicos med ON tq.IdCirujanoPrincipal = med.IdMedico
LEFT JOIN dbo.Especialidades esp ON med.IdEspecialidad = esp.IdEspecialidad
WHERE tq.FechaProgramada BETWEEN @FechaInicio AND @FechaFin
GROUP BY med.NombreCompleto, esp.Nombre
HAVING COUNT(tq.IdTurno) >= 10
ORDER BY CirugiasRealizadas DESC;


-- -----------------------------------------------------------------------------------------
-- INDICADOR 6: DISTRIBUCIÓN POR ESPECIALIDAD Y OBRA SOCIAL (FINANCIADOR)
-- Qué mide: Concentración de demanda de quirófano por cartera de financiadores y ramas quirúrgicas.
-- -----------------------------------------------------------------------------------------
SELECT 
    os.CodigoObraSocial + ' - ' + os.NombreCorto AS ObraSocial,
    esp.Nombre AS Especialidad,
    COUNT(DISTINCT pq.IdProtocolo) AS CantidadCirugias,
    ROUND(COUNT(DISTINCT pq.IdProtocolo) * 100.0 / SUM(COUNT(DISTINCT pq.IdProtocolo)) OVER(), 2) AS PorcentajeDemandaTotal,
    ROUND(SUM(pq.TotalFacturado), 2) AS MontoTotalFacturado,
    ROUND(AVG(DATEDIFF(MINUTE, pq.HoraEntradaSala, pq.HoraSalidaSala)), 1) AS DuracionPromedioMinutos
FROM dbo.ProtocolosQuirurgicos pq
INNER JOIN dbo.ObrasSociales os ON pq.IdObraSocial = os.IdObraSocial
INNER JOIN dbo.Especialidades esp ON pq.IdEspecialidad = esp.IdEspecialidad
WHERE pq.EstadoCirugia = 'Realizada'
  AND pq.FechaCirugia BETWEEN @FechaInicio AND @FechaFin
GROUP BY os.CodigoObraSocial + ' - ' + os.NombreCorto, esp.Nombre
ORDER BY CantidadCirugias DESC;


-- -----------------------------------------------------------------------------------------
-- INDICADOR 7: TASA DE OCUPACIÓN Y DESVÍO DE BLOQUES QUIRÚRGICOS (REGLA DE 7 DÍAS)
-- Qué mide: Horas asignadas a bloques fijos de 3 meses vs ocupación real y alertas de desprogramación con 7 días.
-- -----------------------------------------------------------------------------------------
SELECT 
    bq.IdBloque,
    med.NombreCompleto AS CirujanoResponsable,
    sq.CodigoSala,
    bq.DiaSemana,
    bq.HoraInicio,
    bq.HoraFin,
    bq.HorasAsignadasSemanales * 4.33 AS HorasAsignadasMes,
    ISNULL(SUM(DATEDIFF(MINUTE, pq.HoraEntradaSala, pq.HoraSalidaSala)) / 60.0, 0) AS HorasRealesUtilizadas,
    (bq.HorasAsignadasSemanales * 4.33) - ISNULL(SUM(DATEDIFF(MINUTE, pq.HoraEntradaSala, pq.HoraSalidaSala)) / 60.0, 0) AS HorasOciosas,
    ROUND((ISNULL(SUM(DATEDIFF(MINUTE, pq.HoraEntradaSala, pq.HoraSalidaSala)) / 60.0, 0) * 100.0) / 
          NULLIF(bq.HorasAsignadasSemanales * 4.33, 0), 2) AS PctOcupacionBloque,
    CASE 
        WHEN (ISNULL(SUM(DATEDIFF(MINUTE, pq.HoraEntradaSala, pq.HoraSalidaSala)) / 60.0, 0) * 100.0) / 
             NULLIF(bq.HorasAsignadasSemanales * 4.33, 0) < 70.0 THEN 'ALERTA_SUBUTILIZACION'
        ELSE 'OPTIMO'
    END AS EstadoEficiencia
FROM dbo.BloquesQuirurgicos bq
INNER JOIN dbo.Medicos med ON bq.IdMedico = med.IdMedico
INNER JOIN dbo.SalasQuirurgicas sq ON bq.IdSala = sq.IdSala
LEFT JOIN dbo.ProtocolosQuirurgicos pq 
    ON bq.IdMedico = pq.IdCirujanoPrincipal 
   AND bq.IdSala = pq.IdSala 
   AND pq.FechaCirugia BETWEEN @FechaInicio AND @FechaFin
   AND pq.EstadoCirugia = 'Realizada'
WHERE bq.Activo = 1
GROUP BY bq.IdBloque, med.NombreCompleto, sq.CodigoSala, bq.DiaSemana, bq.HoraInicio, bq.HoraFin, bq.HorasAsignadasSemanales
ORDER BY PctOcupacionBloque ASC;


-- -----------------------------------------------------------------------------------------
-- INDICADOR 8: PRODUCTIVIDAD DEL EQUIPO QUIRÚRGICO (CIRCULANTES, TÉCNICOS, ANESTESISTAS, INSTRUMENTADORES)
-- Qué mide: Carga de intervenciones y horas asistidas por personal de apoyo de quirófano.
-- -----------------------------------------------------------------------------------------
SELECT 
    eq.RolPersonal, -- 'Circulante', 'Tecnico Anestesia', 'Anestesista', 'Instrumentador'
    per.NombreCompleto,
    COUNT(DISTINCT pq.IdProtocolo) AS CantidadCirugiasAsistidas,
    ROUND(SUM(DATEDIFF(MINUTE, pq.HoraEntradaSala, pq.HoraSalidaSala)) / 60.0, 2) AS HorasEnQuirofano,
    ROUND(AVG(DATEDIFF(MINUTE, pq.HoraEntradaSala, pq.HoraSalidaSala)), 1) AS DuracionPromedioMinutos
FROM dbo.ProtocolosPersonal eq
INNER JOIN dbo.Personal per ON eq.IdPersonal = per.IdPersonal
INNER JOIN dbo.ProtocolosQuirurgicos pq ON eq.IdProtocolo = pq.IdProtocolo
WHERE pq.EstadoCirugia = 'Realizada'
  AND pq.FechaCirugia BETWEEN @FechaInicio AND @FechaFin
GROUP BY eq.RolPersonal, per.NombreCompleto
ORDER BY eq.RolPersonal, CantidadCirugiasAsistidas DESC;


-- -----------------------------------------------------------------------------------------
-- INDICADOR 9: SOPORTE INTRAOPERATORIO: ARCO EN C (RX) Y LABORATORIO
-- Qué mide: Requerimientos de intensificador de imágenes para colangiografías/trauma y tiempo de laboratorio.
-- -----------------------------------------------------------------------------------------
SELECT 
    sq.CodigoSala,
    COUNT(DISTINCT pq.IdProtocolo) AS CirugiasTotalesSala,
    SUM(CASE WHEN pq.RequiereArcoEnC = 1 OR ppr.IdPeticion IS NOT NULL THEN 1 ELSE 0 END) AS CirugiasConArcoEnC,
    ROUND(SUM(CASE WHEN pq.RequiereArcoEnC = 1 OR ppr.IdPeticion IS NOT NULL THEN 1 ELSE 0 END) * 100.0 / COUNT(DISTINCT pq.IdProtocolo), 2) AS PctUsoIntensificadorRx,
    SUM(CASE WHEN pq.RequiereLaboratorioIntra = 1 THEN 1 ELSE 0 END) AS CirugiasConLaboratorioIntra,
    AVG(DATEDIFF(MINUTE, pq.HoraTomaMuestraLab, pq.HoraResultadoLab)) AS TiempoPromedioRespuestaLabMin
FROM dbo.ProtocolosQuirurgicos pq
INNER JOIN dbo.SalasQuirurgicas sq ON pq.IdSala = sq.IdSala
LEFT JOIN dbo.PeticionesRadiologia ppr ON pq.IdProtocolo = ppr.IdProtocoloQuirurgico AND ppr.CodigoEstudio LIKE '%ARCO%'
WHERE pq.EstadoCirugia = 'Realizada'
  AND pq.FechaCirugia BETWEEN @FechaInicio AND @FechaFin
GROUP BY sq.CodigoSala
ORDER BY sq.CodigoSala;


-- -----------------------------------------------------------------------------------------
-- INDICADOR 10: TRAZABILIDAD Y DEMANDA TRANSFUSIONAL (PACIENTE AGRUPADO VS. TRANSFUNDIDO)
-- Qué mide: Protocolo Dr. Sota: Cirugías con 2 unidades mandatorias en heladera Qx vs transfusiones reales.
-- -----------------------------------------------------------------------------------------
SELECT 
    FORMAT(pq.FechaCirugia, 'yyyy-MM') AS Mes,
    COUNT(DISTINCT pq.IdProtocolo) AS CirugiasTotales,
    SUM(CASE WHEN pq.EsPacienteAgrupado = 1 OR ht.IdReserva IS NOT NULL THEN 1 ELSE 0 END) AS CirugiasConReservaHeladeraQx,
    SUM(CASE WHEN pq.FueTransfundido = 1 OR ht.UnidadesTransfundidas > 0 THEN 1 ELSE 0 END) AS CirugiasConTransfusionEfectiva,
    ROUND(SUM(CASE WHEN pq.FueTransfundido = 1 THEN 1 ELSE 0 END) * 100.0 / 
          NULLIF(SUM(CASE WHEN pq.EsPacienteAgrupado = 1 THEN 1 ELSE 0 END), 0), 2) AS TasaUtilizacionEfectivaReserva,
    ISNULL(SUM(ht.UnidadesRetornadasBanco), 0) AS UnidadesRetornadasSinPerdida
FROM dbo.ProtocolosQuirurgicos pq
LEFT JOIN dbo.HemoterapiaTransfusiones ht ON pq.IdProtocolo = ht.IdProtocoloQuirurgico
WHERE pq.EstadoCirugia = 'Realizada'
  AND pq.FechaCirugia BETWEEN @FechaInicio AND @FechaFin
GROUP BY FORMAT(pq.FechaCirugia, 'yyyy-MM')
ORDER BY Mes DESC;


-- -----------------------------------------------------------------------------------------
-- INDICADOR 11: CIRUGÍAS COMPUTABLES PARA CAJA COMPENSADORA DE LIQUIDACIÓN
-- Qué mide: Auditoría arancelaria de partes que aplican al fondo de compensación médica profesional.
-- -----------------------------------------------------------------------------------------
SELECT 
    YEAR(pq.FechaCirugia) AS Anio,
    MONTH(pq.FechaCirugia) AS MesNumero,
    FORMAT(pq.FechaCirugia, 'yyyy-MM') AS Periodo,
    COUNT(DISTINCT pq.IdProtocolo) AS CirugiasComputablesCaja,
    SUM(pq.HonorariosCirujano) AS TotalHonorariosLiquidados,
    SUM(pq.GastosSanatoriales) AS TotalGastosSanatoriales,
    ROUND(AVG(pq.HonorariosCirujano), 2) AS HonorarioMedioPorActo
FROM dbo.ProtocolosQuirurgicos pq
INNER JOIN dbo.NomencladorPracticas np ON pq.IdPracticaPrincipal = np.IdPractica
WHERE pq.EstadoCirugia = 'Realizada'
  AND np.AplicaCajaCompensadora = 1
  AND pq.FechaCirugia BETWEEN @FechaInicio AND @FechaFin
GROUP BY YEAR(pq.FechaCirugia), MONTH(pq.FechaCirugia), FORMAT(pq.FechaCirugia, 'yyyy-MM')
ORDER BY Anio DESC, MesNumero DESC;


-- -----------------------------------------------------------------------------------------
-- INDICADOR 12: DEMOGRAFÍA QUIRÚRGICA Y DISTRIBUCIÓN ETARIA (PIRÁMIDE DE PACIENTES)
-- Qué mide: Concentración de pacientes por decenios (0-9, 10-19, 20-29, 30-39, etc.), detectando el pico obstétrico.
-- -----------------------------------------------------------------------------------------
SELECT 
    CASE 
        WHEN DATEDIFF(YEAR, pac.FechaNacimiento, pq.FechaCirugia) < 10 THEN '0 - 9 años'
        WHEN DATEDIFF(YEAR, pac.FechaNacimiento, pq.FechaCirugia) BETWEEN 10 AND 19 THEN '10 - 19 años'
        WHEN DATEDIFF(YEAR, pac.FechaNacimiento, pq.FechaCirugia) BETWEEN 20 AND 29 THEN '20 - 29 años'
        WHEN DATEDIFF(YEAR, pac.FechaNacimiento, pq.FechaCirugia) BETWEEN 30 AND 39 THEN '30 - 39 años (PICO MATERNO)'
        WHEN DATEDIFF(YEAR, pac.FechaNacimiento, pq.FechaCirugia) BETWEEN 40 AND 49 THEN '40 - 49 años'
        WHEN DATEDIFF(YEAR, pac.FechaNacimiento, pq.FechaCirugia) BETWEEN 50 AND 59 THEN '50 - 59 años'
        WHEN DATEDIFF(YEAR, pac.FechaNacimiento, pq.FechaCirugia) BETWEEN 60 AND 69 THEN '60 - 69 años'
        WHEN DATEDIFF(YEAR, pac.FechaNacimiento, pq.FechaCirugia) BETWEEN 70 AND 79 THEN '70 - 79 años'
        ELSE '80+ años'
    END AS DecenioEtario,
    COUNT(DISTINCT pq.IdProtocolo) AS CantidadPacientes,
    ROUND(COUNT(DISTINCT pq.IdProtocolo) * 100.0 / SUM(COUNT(DISTINCT pq.IdProtocolo)) OVER(), 2) AS PorcentajeDemanda,
    SUM(CASE WHEN esp.Nombre LIKE '%Ginecolog%' OR esp.Nombre LIKE '%Obstetric%' THEN 1 ELSE 0 END) AS CirugiasGinecoObstetricas,
    SUM(CASE WHEN esp.Nombre NOT LIKE '%Ginecolog%' AND esp.Nombre NOT LIKE '%Obstetric%' THEN 1 ELSE 0 END) AS CirugiasGeneralesYTrauma
FROM dbo.ProtocolosQuirurgicos pq
INNER JOIN dbo.Pacientes pac ON pq.IdPaciente = pac.IdPaciente
LEFT JOIN dbo.Especialidades esp ON pq.IdEspecialidad = esp.IdEspecialidad
WHERE pq.EstadoCirugia = 'Realizada'
  AND pq.FechaCirugia BETWEEN @FechaInicio AND @FechaFin
GROUP BY 
    CASE 
        WHEN DATEDIFF(YEAR, pac.FechaNacimiento, pq.FechaCirugia) < 10 THEN '0 - 9 años'
        WHEN DATEDIFF(YEAR, pac.FechaNacimiento, pq.FechaCirugia) BETWEEN 10 AND 19 THEN '10 - 19 años'
        WHEN DATEDIFF(YEAR, pac.FechaNacimiento, pq.FechaCirugia) BETWEEN 20 AND 29 THEN '20 - 29 años'
        WHEN DATEDIFF(YEAR, pac.FechaNacimiento, pq.FechaCirugia) BETWEEN 30 AND 39 THEN '30 - 39 años (PICO MATERNO)'
        WHEN DATEDIFF(YEAR, pac.FechaNacimiento, pq.FechaCirugia) BETWEEN 40 AND 49 THEN '40 - 49 años'
        WHEN DATEDIFF(YEAR, pac.FechaNacimiento, pq.FechaCirugia) BETWEEN 50 AND 59 THEN '50 - 59 años'
        WHEN DATEDIFF(YEAR, pac.FechaNacimiento, pq.FechaCirugia) BETWEEN 60 AND 69 THEN '60 - 69 años'
        WHEN DATEDIFF(YEAR, pac.FechaNacimiento, pq.FechaCirugia) BETWEEN 70 AND 79 THEN '70 - 79 años'
        ELSE '80+ años'
    END
ORDER BY MIN(DATEDIFF(YEAR, pac.FechaNacimiento, pq.FechaCirugia));


-- -----------------------------------------------------------------------------------------
-- INDICADOR 13: CARÁCTER DE LA INTERVENCIÓN: ELECTIVAS (PRESENTE) VS. URGENCIAS POR CIRUJANO
-- Qué mide: Porcentaje y cirujanos que absorben la demanda no programada de guardia en quirófano.
-- -----------------------------------------------------------------------------------------
SELECT 
    med.NombreCompleto AS CirujanoResponsable,
    esp.Nombre AS Especialidad,
    SUM(CASE WHEN ISNULL(tq.TipoAsistencia, 'Presente') = 'Presente' AND ISNULL(pq.EsUrgencia, 0) = 0 THEN 1 ELSE 0 END) AS CirugiasElectivasProgramadas,
    SUM(CASE WHEN tq.TipoAsistencia = 'URGENCIA' OR pq.EsUrgencia = 1 THEN 1 ELSE 0 END) AS CirugiasUrgencia,
    COUNT(pq.IdProtocolo) AS TotalCirugiasRealizadas,
    ROUND(SUM(CASE WHEN tq.TipoAsistencia = 'URGENCIA' OR pq.EsUrgencia = 1 THEN 1 ELSE 0 END) * 100.0 / 
          NULLIF(COUNT(pq.IdProtocolo), 0), 2) AS PorcentajeUrgencia
FROM dbo.ProtocolosQuirurgicos pq
INNER JOIN dbo.Medicos med ON pq.IdCirujanoPrincipal = med.IdMedico
LEFT JOIN dbo.Especialidades esp ON pq.IdEspecialidad = esp.IdEspecialidad
LEFT JOIN dbo.TurnosQuirurgicos tq ON pq.IdTurno = tq.IdTurno
WHERE pq.EstadoCirugia = 'Realizada'
  AND pq.FechaCirugia BETWEEN @FechaInicio AND @FechaFin
GROUP BY med.NombreCompleto, esp.Nombre
HAVING COUNT(pq.IdProtocolo) >= 10
ORDER BY CirugiasUrgencia DESC, TotalCirugiasRealizadas DESC;


-- -----------------------------------------------------------------------------------------
-- INDICADOR 14: VULNERABILIDAD Y TASA DE SUSPENSIÓN POR PROCEDIMIENTO NOMENCLADO
-- Qué mide: Tasa de suspensión específica para cada práctica (Cesárea, Histeroscopía, Colecistectomía, etc.).
-- -----------------------------------------------------------------------------------------
SELECT 
    np.CodigoPractica,
    np.DescripcionPractica AS ProcedimientoQuirurgico,
    SUM(CASE WHEN tq.Estado = 'Realizado' THEN 1 ELSE 0 END) AS Realizadas,
    SUM(CASE WHEN tq.Estado IN ('Suspendido', 'Cancelado') THEN 1 ELSE 0 END) AS Suspendidas,
    COUNT(*) AS TotalAgendadas,
    ROUND(SUM(CASE WHEN tq.Estado IN ('Suspendido', 'Cancelado') THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) AS TasaSuspensionPracticaPct
FROM dbo.TurnosQuirurgicos tq
INNER JOIN dbo.NomencladorPracticas np ON tq.IdPracticaPrincipal = np.IdPractica
WHERE tq.FechaProgramada BETWEEN @FechaInicio AND @FechaFin
GROUP BY np.CodigoPractica, np.DescripcionPractica
HAVING COUNT(*) >= 15
ORDER BY Realizadas DESC;


-- -----------------------------------------------------------------------------------------
-- INDICADOR 15: CICLO DE VIDA: CONVERSIÓN DE REPROGRAMADAS Y CANCELACIÓN DEFINITIVA
-- Qué mide: Discrimina 1-Realizada Directa, 2-Realizada Reprogramada y 3-Suspendida Definitiva (Pérdida Neta).
-- -----------------------------------------------------------------------------------------
SELECT 
    FORMAT(tq.FechaProgramada, 'yyyy-MM') AS Mes,
    COUNT(*) AS TotalTurnosAgendados,
    SUM(CASE WHEN tq.Estado = 'Realizado' AND ISNULL(tq.EsReprogramado, 0) = 0 THEN 1 ELSE 0 END) AS RealizadasDirectas,
    SUM(CASE WHEN tq.Estado = 'Realizado' AND tq.EsReprogramado = 1 THEN 1 ELSE 0 END) AS RealizadasReprogramadas,
    SUM(CASE WHEN tq.Estado IN ('Suspendido', 'Cancelado') THEN 1 ELSE 0 END) AS SuspendidasDefinitivas,
    ROUND(SUM(CASE WHEN tq.Estado = 'Realizado' AND tq.EsReprogramado = 1 THEN 1 ELSE 0 END) * 100.0 / 
          NULLIF(SUM(CASE WHEN tq.EsReprogramado = 1 THEN 1 ELSE 0 END), 0), 2) AS EficaciaRecuperoReprogramadasPct,
    ROUND(SUM(CASE WHEN tq.Estado IN ('Suspendido', 'Cancelado') THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) AS TasaPerdidaNetaPct
FROM dbo.TurnosQuirurgicos tq
WHERE tq.FechaProgramada BETWEEN @FechaInicio AND @FechaFin
GROUP BY FORMAT(tq.FechaProgramada, 'yyyy-MM')
ORDER BY Mes DESC;
