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
        TriageReal AS (
            SELECT 
                r.idEntrada,
                MAX(CASE WHEN r.idPreguntaPr = 13807 THEN CAST(r.valorM AS VARCHAR(MAX)) END) AS ObservacionTriage,
                MAX(CASE WHEN r.idPreguntaPr = 13802 THEN r.valorN END) AS TD,
                MAX(CASE WHEN r.idPreguntaPr = 13814 THEN r.valorN END) AS TS,
                MAX(CASE WHEN r.idPreguntaPr = 13803 THEN r.valorN END) AS FC,
                MAX(CASE WHEN r.idPreguntaPr = 13804 THEN r.valorN END) AS Temp,
                MAX(CASE WHEN r.idPreguntaPr = 13815 THEN r.valorN END) AS SAO2
            FROM [PR InstRespEntrada] r
            WHERE r.idPreguntaPr IN (13802, 13814, 13803, 13804, 13805, 13806, 13815, 13807)
              AND r.activo = 1
            GROUP BY r.idEntrada
        ),
        ConsultasGuardia AS (
            SELECT 
                v.idVisita,
                v.idEntrada,
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
                CASE WHEN tr.idEntrada IS NOT NULL THEN 1 ELSE 0 END AS TieneTriageEnfermeria,
                CASE 
                    WHEN tr.idEntrada IS NULL THEN 'Sin Triage'
                    WHEN UPPER(tr.ObservacionTriage) LIKE '%ROJO%' THEN 'N1 Rojo (Emergencia)'
                    WHEN UPPER(tr.ObservacionTriage) LIKE '%NARANJA%' THEN 'N2 Naranja (Muy Urgente)'
                    WHEN UPPER(tr.ObservacionTriage) LIKE '%AMARILLO%' THEN 'N3 Amarillo (Urgente)'
                    WHEN UPPER(tr.ObservacionTriage) LIKE '%VERDE%' THEN 'N4 Verde (Poco Urgente)'
                    WHEN UPPER(tr.ObservacionTriage) LIKE '%AZUL%' THEN 'N5 Azul (No Urgente)'
                    ELSE 'Evaluado Clínico / Signos'
                END AS NivelTriage
            FROM VLISE_Visitas v
            LEFT JOIN TriageReal tr ON v.idEntrada = tr.idEntrada
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
                adm.[Motivo de alta] AS MotivoAlta,
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
            (SELECT COUNT(*) FROM ConsultasGuardia WHERE TieneTriageEnfermeria = 1) AS consultas_con_triage,
            CAST((SELECT COUNT(*) FROM ConsultasGuardia WHERE TieneTriageEnfermeria = 1) * 100.0 / NULLIF((SELECT COUNT(*) FROM ConsultasGuardia), 0) AS DECIMAL(5,2)) AS cobertura_triage_pct,
            (SELECT COUNT(*) FROM Reconsultas72h) AS cantidad_reconsultas_72h,
            CAST((SELECT COUNT(*) FROM Reconsultas72h) * 100.0 / NULLIF((SELECT COUNT(*) FROM ConsultasGuardia), 0) AS DECIMAL(5,2)) AS reconsulta_72h_pct,
            (SELECT COUNT(*) FROM AdmisionesClinicas) AS total_altas_clinicas,
            (SELECT SUM(EsReinternacion72h) FROM AdmisionesClinicas WHERE FechaAlta IS NOT NULL) AS reinternaciones_72h,
            CAST((SELECT SUM(EsReinternacion72h) FROM AdmisionesClinicas WHERE FechaAlta IS NOT NULL) * 100.0 / 
                 NULLIF((SELECT COUNT(*) FROM AdmisionesClinicas WHERE FechaAlta IS NOT NULL), 0) AS DECIMAL(5,2)) AS reinternacion_72h_pct,
            CAST((SELECT AVG(DiasEstada * 1.0) FROM AdmisionesClinicas WHERE FechaAlta IS NOT NULL) AS DECIMAL(5,2)) AS promedio_dias_estada,
            (SELECT COUNT(CASE WHEN MotivoAlta IS NOT NULL THEN 1 END) FROM AdmisionesClinicas) AS altas_con_epicrisis,
            CAST((SELECT COUNT(CASE WHEN MotivoAlta IS NOT NULL THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0) FROM AdmisionesClinicas) AS DECIMAL(5,2)) AS adherencia_epicrisis_pct;
    `;

    const resPrincipal = await pool.request().query(queryMaestra);
    const row = resPrincipal.recordset[0] || {};

    // Consultar desglose de triage con enfermería real
    const queryTriage = `
        WITH TriageReal AS (
            SELECT 
                r.idEntrada,
                MAX(CASE WHEN r.idPreguntaPr = 13807 THEN CAST(r.valorM AS VARCHAR(MAX)) END) AS ObservacionTriage
            FROM [PR InstRespEntrada] r
            WHERE r.idPreguntaPr IN (13802, 13814, 13803, 13804, 13805, 13806, 13815, 13807)
              AND r.activo = 1
            GROUP BY r.idEntrada
        )
        SELECT 
            CASE 
                WHEN tr.idEntrada IS NULL THEN 'Sin Triage'
                WHEN UPPER(tr.ObservacionTriage) LIKE '%ROJO%' THEN 'N1 Rojo (Emergencia)'
                WHEN UPPER(tr.ObservacionTriage) LIKE '%NARANJA%' THEN 'N2 Naranja (Muy Urgente)'
                WHEN UPPER(tr.ObservacionTriage) LIKE '%AMARILLO%' THEN 'N3 Amarillo (Urgente)'
                WHEN UPPER(tr.ObservacionTriage) LIKE '%VERDE%' THEN 'N4 Verde (Poco Urgente)'
                WHEN UPPER(tr.ObservacionTriage) LIKE '%AZUL%' THEN 'N5 Azul (No Urgente)'
                ELSE 'Evaluado Clínico / Signos'
            END AS nivel,
            COUNT(*) AS cantidad,
            CAST(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER() AS DECIMAL(5,2)) AS porcentaje
        FROM VLISE_Visitas v
        LEFT JOIN TriageReal tr ON v.idEntrada = tr.idEntrada
        WHERE v.[Grupo Agenda] = 'GUARDIA CLINICA'
          AND v.[Fecha Visita] >= '${fechaDesde} 00:00:00'
          AND v.[Fecha Visita] <= '${fechaHasta} 23:59:59'
          AND v.Asistencia = 'Presente'
        GROUP BY 
            CASE 
                WHEN tr.idEntrada IS NULL THEN 'Sin Triage'
                WHEN UPPER(tr.ObservacionTriage) LIKE '%ROJO%' THEN 'N1 Rojo (Emergencia)'
                WHEN UPPER(tr.ObservacionTriage) LIKE '%NARANJA%' THEN 'N2 Naranja (Muy Urgente)'
                WHEN UPPER(tr.ObservacionTriage) LIKE '%AMARILLO%' THEN 'N3 Amarillo (Urgente)'
                WHEN UPPER(tr.ObservacionTriage) LIKE '%VERDE%' THEN 'N4 Verde (Poco Urgente)'
                WHEN UPPER(tr.ObservacionTriage) LIKE '%AZUL%' THEN 'N5 Azul (No Urgente)'
                ELSE 'Evaluado Clínico / Signos'
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

    // Consultar desglose demográfico por sexo
    const querySexo = `
        SELECT 
            CASE 
                WHEN p.sexo = 'F' THEN 'Mujer'
                WHEN p.sexo = 'M' THEN 'Hombre'
                ELSE 'Sin especificar'
            END AS sexo,
            COUNT(*) AS cantidad,
            CAST(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER() AS DECIMAL(5,2)) AS porcentaje
        FROM VLISE_Visitas v
        LEFT JOIN FE_Entidades p ON v.NHC = p.NHC
        WHERE v.[Grupo Agenda] = 'GUARDIA CLINICA'
          AND v.[Fecha Visita] >= '${fechaDesde} 00:00:00'
          AND v.[Fecha Visita] <= '${fechaHasta} 23:59:59'
          AND v.Asistencia = 'Presente'
        GROUP BY 
            CASE 
                WHEN p.sexo = 'F' THEN 'Mujer'
                WHEN p.sexo = 'M' THEN 'Hombre'
                ELSE 'Sin especificar'
            END;
    `;
    const resSexo = await pool.request().query(querySexo);
    const sexoDistribucion = resSexo.recordset || [];
    const mujerRow = sexoDistribucion.find(s => s.sexo === 'Mujer');
    const hombreRow = sexoDistribucion.find(s => s.sexo === 'Hombre');
    const mujeresPct = mujerRow ? Number(mujerRow.porcentaje) : 0;
    const hombresPct = hombreRow ? Number(hombreRow.porcentaje) : 0;

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
        sexo_distribucion: sexoDistribucion,
        mujeres_pct: mujeresPct,
        hombres_pct: hombresPct,
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

    // Sincronizar pacientes nominales con triage en guardia_triage_pacientes
    if (periodo !== '2026-ANUAL') {
        try {
            const queryNominalTriage = `
                WITH TriageReal AS (
                    SELECT 
                        r.idEntrada,
                        MAX(CASE WHEN r.idPreguntaPr = 13807 THEN CAST(r.valorM AS VARCHAR(MAX)) END) AS ObservacionTriage,
                        MAX(CASE WHEN r.idPreguntaPr = 13802 THEN r.valorN END) AS TD,
                        MAX(CASE WHEN r.idPreguntaPr = 13814 THEN r.valorN END) AS TS,
                        MAX(CASE WHEN r.idPreguntaPr = 13803 THEN r.valorN END) AS FC,
                        MAX(CASE WHEN r.idPreguntaPr = 13804 THEN r.valorN END) AS Temp,
                        MAX(CASE WHEN r.idPreguntaPr = 13815 THEN r.valorN END) AS SAO2
                    FROM [PR InstRespEntrada] r
                    WHERE r.idPreguntaPr IN (13802, 13814, 13803, 13804, 13805, 13806, 13815, 13807)
                      AND r.activo = 1
                    GROUP BY r.idEntrada
                )
                SELECT 
                    '${periodo}' AS periodo,
                    LTRIM(RTRIM(v.NHC)) AS nhc,
                    LTRIM(RTRIM(v.Paciente)) AS paciente,
                    LTRIM(RTRIM(v.Cliente)) AS obra_social,
                    LTRIM(RTRIM(v.Agenda)) AS agenda,
                    LTRIM(RTRIM(v.[Tipo Visita])) AS tipo_visita,
                    CONVERT(VARCHAR(10), v.[Fecha Visita], 23) AS fecha_visita,
                    CONVERT(VARCHAR(8), v.[Fecha Entrada Real], 108) AS hora_llegada,
                    CASE 
                        WHEN UPPER(tr.ObservacionTriage) LIKE '%ROJO%' THEN 'N1 Rojo (Emergencia)'
                        WHEN UPPER(tr.ObservacionTriage) LIKE '%NARANJA%' THEN 'N2 Naranja (Muy Urgente)'
                        WHEN UPPER(tr.ObservacionTriage) LIKE '%AMARILLO%' THEN 'N3 Amarillo (Urgente)'
                        WHEN UPPER(tr.ObservacionTriage) LIKE '%VERDE%' THEN 'N4 Verde (Poco Urgente)'
                        WHEN UPPER(tr.ObservacionTriage) LIKE '%AZUL%' THEN 'N5 Azul (No Urgente)'
                        ELSE 'Evaluado Clínico / Signos'
                    END AS nivel_triage,
                    ISNULL(CAST(tr.ObservacionTriage AS VARCHAR(500)), NULL) AS observacion_enfermeria,
                    tr.TS AS ta_sistolica,
                    tr.TD AS ta_diastolica,
                    tr.FC AS fc,
                    tr.Temp AS temperatura,
                    tr.SAO2 AS sato2
                FROM VLISE_Visitas v
                INNER JOIN TriageReal tr ON v.idEntrada = tr.idEntrada
                WHERE v.[Grupo Agenda] = 'GUARDIA CLINICA'
                  AND v.[Fecha Visita] >= '${fechaDesde} 00:00:00'
                  AND v.[Fecha Visita] <= '${fechaHasta} 23:59:59'
                  AND v.Asistencia = 'Presente'
                ORDER BY v.[Fecha Visita] ASC, v.[Fecha Entrada Real] ASC;
            `;
            const resNominal = await pool.request().query(queryNominalTriage);
            const nominalRows = resNominal.recordset || [];
            if (nominalRows.length > 0) {
                await supabase.from('guardia_triage_pacientes').delete().eq('periodo', periodo);
                const batchSize = 100;
                for (let i = 0; i < nominalRows.length; i += batchSize) {
                    await supabase.from('guardia_triage_pacientes').insert(nominalRows.slice(i, i + batchSize));
                }
                console.log(`   📋 ${nominalRows.length} pacientes con triage sincronizados en guardia_triage_pacientes.`);
            }
        } catch (eNom) {
            console.warn(`   ⚠️ Advertencia sincronizando guardia_triage_pacientes para ${periodo}:`, eNom.message);
        }
    }

    return payload;
}

function buildDynamicMesesGuardia(fastSync = false) {
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth() + 1;
    const allMonths = [];

    for (let m = 1; m <= curMonth; m++) {
        const mm = String(m).padStart(2, '0');
        const lastDay = new Date(curYear, m, 0).getDate();
        allMonths.push({
            periodo: `${curYear}-${mm}`,
            desde: `${curYear}-${mm}-01`,
            hasta: `${curYear}-${mm}-${String(lastDay).padStart(2, '0')}`
        });
    }

    const selected = fastSync ? allMonths.slice(-2) : allMonths;
    const lastDayCur = new Date(curYear, curMonth, 0).getDate();
    selected.push({
        periodo: `${curYear}-ANUAL`,
        desde: `${curYear}-01-01`,
        hasta: `${curYear}-${String(curMonth).padStart(2, '0')}-${String(lastDayCur).padStart(2, '0')}`
    });
    return selected;
}

export async function syncGuardiaIndicadores({ fastSync = false } = {}) {
    console.log(`🚀 Iniciando sincronización de Indicadores de Guardia Clínica (fastSync: ${fastSync})...`);
    const pool = await sql.connect(SQL_CONFIG);
    const meses = buildDynamicMesesGuardia(fastSync);
    let processed = 0;

    try {
        for (const m of meses) {
            try {
                await procesarPeriodo(pool, m.periodo, m.desde, m.hasta);
                processed++;
            } catch (err) {
                console.error(`❌ Error procesando ${m.periodo}:`, err.message);
            }
        }
    } finally {
        await pool.close();
    }
    console.log('\n🏁 Sincronización completa de Indicadores de Guardia Clínica.');
    return { processed, periodos: meses.map(m => m.periodo) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
    syncGuardiaIndicadores({ fastSync: false }).catch(console.error);
}
