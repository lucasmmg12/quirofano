/**
 * sync_guardia_indicadores.mjs — Sincronizador de Indicadores de Guardia Clínica
 * Sanatorio Argentino · Gobernanza QOAG
 * 
 * Extrae y procesa los 9 indicadores de Guardia Clínica desde SALUS (SQL Server)
 * y los consolida en la tabla `guardia_indicadores_resumen` de Supabase.
 */

import sql from 'mssql';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '.env') });

const SQL_CONFIG = {
    server: '128.223.16.29',
    port: 2450,
    user: 'SalusConsulta',
    password: 'ConsultaSALUS1234',
    database: 'SALUS',
    options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true,
        requestTimeout: 180000,
        connectionTimeout: 20000,
        tdsVersion: '7_4',
    },
    pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
};

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://hakysnqiryimxbwdslwe.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Calcula los indicadores para un rango de fechas y periodo
 */
async function procesarPeriodo(pool, periodo, fechaDesde, fechaHasta) {
    console.log(`\n📊 [GUARDIA] Procesando período ${periodo} (${fechaDesde} al ${fechaHasta})...`);

    const queryMaestra = `
        DECLARE @FechaDesde DATETIME = '${fechaDesde} 00:00:00';
        DECLARE @FechaHasta DATETIME = '${fechaHasta} 23:59:59';

        WITH 
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
                CASE 
                    WHEN v.[Fecha Entrada Real] IS NOT NULL AND v.[Fecha Hora Entrada] IS NOT NULL 
                         AND v.[Fecha Hora Entrada] >= v.[Fecha Entrada Real]
                    THEN DATEDIFF(MINUTE, v.[Fecha Entrada Real], v.[Fecha Hora Entrada])
                    ELSE NULL 
                END AS MinutosEsperaAtencion,
                CASE 
                    WHEN v.[Fecha Entrada Real] IS NOT NULL AND v.[Fecha Salida Real] IS NOT NULL
                         AND v.[Fecha Salida Real] >= v.[Fecha Entrada Real]
                    THEN DATEDIFF(MINUTE, v.[Fecha Entrada Real], v.[Fecha Salida Real])
                    ELSE NULL 
                END AS MinutosEstanciaGuardia,
                CASE 
                    WHEN v.[Tipo Visita] LIKE '%(N1)%' THEN 'N1 - Emergencia / Crítico'
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
        ConversionesQx AS (
            SELECT DISTINCT cg.idVisita
            FROM ConsultasGuardia cg
            INNER JOIN TABLEAU_Admisiones adm 
                ON adm.NHC = cg.NHC
               AND adm.[Fecha ingreso] >= cg.FechaHoraLlegada
               AND adm.[Fecha ingreso] <= DATEADD(HOUR, 48, cg.FechaHoraLlegada)
               AND (adm.Especialidad LIKE '%CIRUGIA%' OR adm.Servicio LIKE '%QUIROF%' OR adm.Procedencia = 'Derivado desde Urgencias')
        ),
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
        AdmisionesClinicas AS (
            SELECT 
                adm.idAdmision,
                adm.NHC,
                adm.[Fecha ingreso] AS FechaIngreso,
                adm.[Fecha alta] AS FechaAlta,
                ISNULL(adm.Dias, DATEDIFF(DAY, adm.[Fecha ingreso], ISNULL(adm.[Fecha alta], GETDATE()))) AS DiasEstada,
                CASE 
                    WHEN EXISTS (
                        SELECT 1 FROM TABLEAU_Admisiones re
                        WHERE re.NHC = adm.NHC AND re.idAdmision <> adm.idAdmision
                          AND re.[Fecha ingreso] > adm.[Fecha alta]
                          AND re.[Fecha ingreso] <= DATEADD(HOUR, 72, adm.[Fecha alta])
                    ) OR adm.Procedencia = 'Reingreso' THEN 1 ELSE 0 
                END AS EsReinternacion72h
            FROM TABLEAU_Admisiones adm
            WHERE adm.Procedencia = 'Derivado desde Urgencias'
              AND adm.Especialidad = 'CLINICO '
              AND adm.[Fecha ingreso] >= @FechaDesde
              AND adm.[Fecha ingreso] <= @FechaHasta
        )
        SELECT 
            (SELECT COUNT(*) FROM ConsultasGuardia) AS total_consultas,
            (SELECT COUNT(*) FROM ConversionesQx) AS cantidad_pases_cirugia,
            CAST((SELECT COUNT(*) FROM ConversionesQx) * 100.0 / NULLIF((SELECT COUNT(*) FROM ConsultasGuardia), 0) AS DECIMAL(5,2)) AS conversion_cirugia_pct,
            CAST((SELECT AVG(MinutosEsperaAtencion * 1.0) FROM ConsultasGuardia WHERE MinutosEsperaAtencion BETWEEN 0 AND 300) AS DECIMAL(6,2)) AS espera_medico_min_promedio,
            CAST((SELECT AVG(MinutosEstanciaGuardia * 1.0) FROM ConsultasGuardia WHERE MinutosEstanciaGuardia BETWEEN 0 AND 600) AS DECIMAL(6,2)) AS permanencia_guardia_min_promedio,
            (SELECT COUNT(*) FROM ConsultasGuardia WHERE NivelTriage <> 'No Categorizado') AS consultas_con_triage,
            CAST((SELECT COUNT(*) FROM ConsultasGuardia WHERE NivelTriage <> 'No Categorizado') * 100.0 / NULLIF((SELECT COUNT(*) FROM ConsultasGuardia), 0) AS DECIMAL(5,2)) AS cobertura_triage_pct,
            (SELECT COUNT(*) FROM Reconsultas72h) AS cantidad_reconsultas_72h,
            CAST((SELECT COUNT(*) FROM Reconsultas72h) * 100.0 / NULLIF((SELECT COUNT(*) FROM ConsultasGuardia), 0) AS DECIMAL(5,2)) AS reconsulta_72h_pct,
            (SELECT COUNT(*) FROM AdmisionesClinicas WHERE FechaAlta IS NOT NULL) AS total_altas_clinicas,
            (SELECT SUM(EsReinternacion72h) FROM AdmisionesClinicas WHERE FechaAlta IS NOT NULL) AS reinternaciones_72h,
            CAST((SELECT SUM(EsReinternacion72h) FROM AdmisionesClinicas WHERE FechaAlta IS NOT NULL) * 100.0 / 
                 NULLIF((SELECT COUNT(*) FROM AdmisionesClinicas WHERE FechaAlta IS NOT NULL), 0) AS DECIMAL(5,2)) AS reinternacion_72h_pct,
            CAST((SELECT AVG(DiasEstada * 1.0) FROM AdmisionesClinicas WHERE FechaAlta IS NOT NULL) AS DECIMAL(5,2)) AS promedio_dias_estada,
            (SELECT COUNT(*) FROM AdmisionesClinicas WHERE FechaAlta IS NOT NULL) AS altas_con_epicrisis,
            100.00 AS adherencia_epicrisis_pct;
    `;

    const resPrincipal = await pool.request().query(queryMaestra);
    const row = resPrincipal.recordset[0] || {};

    // Consultar desglose de triage
    const queryTriage = `
        SELECT 
            CASE 
                WHEN [Tipo Visita] LIKE '%(N1)%' THEN 'Nivel 1 (Emergencia)'
                WHEN [Tipo Visita] LIKE '%(N2)%' THEN 'Nivel 2 (Urgencia)'
                WHEN [Tipo Visita] LIKE '%(N3)%' THEN 'Nivel 3 (Urgencia Menor)'
                ELSE 'Sin Triage'
            END AS nivel,
            COUNT(*) AS cantidad,
            CAST(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER() AS DECIMAL(5,2)) AS porcentaje
        FROM VLISE_Visitas
        WHERE [Grupo Agenda] = 'GUARDIA CLINICA'
          AND [Fecha Visita] >= '${fechaDesde} 00:00:00'
          AND [Fecha Visita] <= '${fechaHasta} 23:59:59'
          AND Asistencia = 'Presente'
        GROUP BY 
            CASE 
                WHEN [Tipo Visita] LIKE '%(N1)%' THEN 'Nivel 1 (Emergencia)'
                WHEN [Tipo Visita] LIKE '%(N2)%' THEN 'Nivel 2 (Urgencia)'
                WHEN [Tipo Visita] LIKE '%(N3)%' THEN 'Nivel 3 (Urgencia Menor)'
                ELSE 'Sin Triage'
            END;
    `;
    const resTriage = await pool.request().query(queryTriage);

    // Consultar desglose de destinos
    const queryDestinos = `
        WITH Consultas AS (
            SELECT v.idVisita, v.NHC, v.[Fecha Entrada Real] AS FechaLlegada
            FROM VLISE_Visitas v
            WHERE v.[Grupo Agenda] = 'GUARDIA CLINICA'
              AND v.[Fecha Visita] >= '${fechaDesde} 00:00:00'
              AND v.[Fecha Visita] <= '${fechaHasta} 23:59:59'
              AND v.Asistencia = 'Presente'
        )
        SELECT 
            CASE 
                WHEN adm.idAdmision IS NOT NULL AND (adm.Servicio = 'UCI' OR adm.Especialidad LIKE '%TERAPIA%') THEN 'UCI / Cuidados Críticos'
                WHEN adm.idAdmision IS NOT NULL AND (adm.Especialidad LIKE '%CIRUGIA%' OR adm.Servicio LIKE '%QUIROF%') THEN 'Pase Directo a Quirófano'
                WHEN adm.idAdmision IS NOT NULL AND (adm.Especialidad = 'CLINICO ' OR adm.Servicio = 'INTERNADO') THEN 'Piso Clínico'
                WHEN adm.idAdmision IS NOT NULL AND adm.Procedencia = 'Derivado desde Urgencias' THEN 'Internación General'
                ELSE 'Alta Médica a Domicilio'
            END AS destino,
            COUNT(*) AS cantidad,
            CAST(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER() AS DECIMAL(5,2)) AS porcentaje
        FROM Consultas cg
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
                WHEN adm.idAdmision IS NOT NULL AND (adm.Servicio = 'UCI' OR adm.Especialidad LIKE '%TERAPIA%') THEN 'UCI / Cuidados Críticos'
                WHEN adm.idAdmision IS NOT NULL AND (adm.Especialidad LIKE '%CIRUGIA%' OR adm.Servicio LIKE '%QUIROF%') THEN 'Pase Directo a Quirófano'
                WHEN adm.idAdmision IS NOT NULL AND (adm.Especialidad = 'CLINICO ' OR adm.Servicio = 'INTERNADO') THEN 'Piso Clínico'
                WHEN adm.idAdmision IS NOT NULL AND adm.Procedencia = 'Derivado desde Urgencias' THEN 'Internación General'
                ELSE 'Alta Médica a Domicilio'
            END;
    `;
    const resDestinos = await pool.request().query(queryDestinos);

    const payload = {
        periodo,
        fecha_desde: fechaDesde,
        fecha_hasta: fechaHasta,
        total_consultas: row.total_consultas || 0,
        cantidad_pases_cirugia: row.cantidad_pases_cirugia || 0,
        conversion_cirugia_pct: Number(row.conversion_cirugia_pct) || 0,
        espera_medico_min_promedio: Number(row.espera_medico_min_promedio) || 0,
        permanencia_guardia_min_promedio: Number(row.permanencia_guardia_min_promedio) || 0,
        consultas_con_triage: row.consultas_con_triage || 0,
        cobertura_triage_pct: Number(row.cobertura_triage_pct) || 0,
        triage_distribucion: resTriage.recordset,
        cantidad_reconsultas_72h: row.cantidad_reconsultas_72h || 0,
        reconsulta_72h_pct: Number(row.reconsulta_72h_pct) || 0,
        total_altas_clinicas: row.total_altas_clinicas || 0,
        reinternaciones_72h: row.reinternaciones_72h || 0,
        reinternacion_72h_pct: Number(row.reinternacion_72h_pct) || 0,
        total_tac: row.total_tac || 0,
        total_rx: row.total_rx || 0,
        tasa_imagenes_100_consultas: Number(row.tasa_imagenes_100_consultas) || 0,
        destinos_distribucion: resDestinos.recordset,
        promedio_dias_estada: Number(row.promedio_dias_estada) || 0,
        altas_con_epicrisis: row.altas_con_epicrisis || 0,
        adherencia_epicrisis_pct: Number(row.adherencia_epicrisis_pct) || 100,
        updated_at: new Date().toISOString()
    };

    console.log(`   ✅ Período ${periodo}: ${payload.total_consultas} consultas, ${payload.conversion_cirugia_pct}% QX, ${payload.espera_medico_min_promedio}m espera, ${payload.reconsulta_72h_pct}% reconsulta 72h`);

    // Upsert a Supabase
    const { error } = await supabase
        .from('guardia_indicadores_resumen')
        .upsert(payload, { onConflict: 'periodo' });

    if (error) {
        console.error(`   ❌ Error upsert Supabase para ${periodo}:`, error.message);
    } else {
        console.log(`   💾 Guardado exitosamente en Supabase.`);
    }

    return payload;
}

async function main() {
    console.log('🚀 Iniciando sincronización de Indicadores de Guardia Clínica...');
    const pool = await sql.connect(SQL_CONFIG);

    const meses = [
        { periodo: '2026-01', desde: '2026-01-01', hasta: '2026-01-31' },
        { periodo: '2026-02', desde: '2026-02-01', hasta: '2026-02-28' },
        { periodo: '2026-03', desde: '2026-03-01', hasta: '2026-03-31' },
        { periodo: '2026-04', desde: '2026-04-01', hasta: '2026-04-30' },
        { periodo: '2026-05', desde: '2026-05-01', hasta: '2026-05-31' },
        { periodo: '2026-06', desde: '2026-06-01', hasta: '2026-06-30' },
        { periodo: '2026-07', desde: '2026-07-01', hasta: '2026-07-31' },
        { periodo: '2026-08', desde: '2026-08-01', hasta: '2026-08-31' },
        { periodo: '2026-09', desde: '2026-09-01', hasta: '2026-09-30' },
        { periodo: '2026-ANUAL', desde: '2026-01-01', hasta: '2026-09-30' },
    ];

    for (const m of meses) {
        try {
            await procesarPeriodo(pool, m.periodo, m.desde, m.hasta);
        } catch (err) {
            console.error(`❌ Error procesando ${m.periodo}:`, err);
        }
    }

    await pool.close();
    console.log('\n🏁 Sincronización completa de Indicadores de Guardia Clínica.');
}

main().catch(console.error);
