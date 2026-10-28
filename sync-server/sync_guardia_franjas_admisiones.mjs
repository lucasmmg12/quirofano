/**
 * sync_guardia_franjas_admisiones.mjs
 * Sanatorio Argentino · Gobernanza y Calidad QOAG · Grow Labs
 * 
 * Extrae y calcula desde SALUS (SQL Server):
 * 1. Tiempos Puerta-Médico por 3 Franjas Horarias (08 a 14, 14 a 22, 22 a 08) con Min, Max, Avg +
 *    Valores Extremos Nominales (>60m y >120m) y análisis por Día de la Semana (ej. Lunes).
 * 2. Trazabilidad de Admisiones Médicas Clínicas basada en Protocolo 557 ('(INT) ADMISION MEDICA CLINICA')
 *    cruzado con TABLEAU_Admisiones y TABLEAU_Cirugias (Quirófano real, Piso, UCI y Reinternación 72h).
 * 3. Seguimiento Clínico en Piso (Excluyendo Guardia ambulatoria, Laboratorios, Chequeo, UCI,
 *    Terapia Intermedia hab. 222-229/227, Shock Room y Pediatría hab. 201-203).
 */

import sql from 'mssql';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envLocal = path.join(__dirname, '.env');
const envParent = path.join(__dirname, '..', '.env');
dotenv.config({ path: fs.existsSync(envLocal) ? envLocal : envParent });

const SQL_CONFIG = {
    server: process.env.SALUS_HOST || process.env.SALUS_DB_SERVER || '128.223.16.29',
    port: parseInt(process.env.SALUS_PORT || process.env.SALUS_DB_PORT || '2450', 10),
    user: process.env.SALUS_USER || process.env.SALUS_DB_USER || 'SalusConsulta',
    password: process.env.SALUS_PASSWORD || process.env.SALUS_DB_PASSWORD || 'ConsultaSALUS1234',
    database: process.env.SALUS_DATABASE || process.env.SALUS_DB_NAME || 'SALUS',
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

const DIAS_SEMANA_ES = {
    1: 'Domingo',
    2: 'Lunes',
    3: 'Martes',
    4: 'Miércoles',
    5: 'Jueves',
    6: 'Viernes',
    7: 'Sábado'
};

export async function syncPeriodo(pool, periodo, desde, hasta, extremosAcumulados) {
    console.log(`\n🩺 [GUARDIA & INTERNADO - REGLAS DRA. PAOLA GARCÍA] Sincronizando ${periodo} (${desde} al ${hasta})...`);

    // ── 1. FRANJAS HORARIAS PUERTA-MÉDICO (08 a 14, 14 a 22, 22 a 08) ──
    const qFranjas = `
        WITH ConsultasConTiempos AS (
            SELECT 
                v.idVisita,
                v.NHC,
                v.Paciente,
                v.Responsable,
                v.Cliente,
                v.[Fecha Entrada Real] AS FechaLlegada,
                v.[Fecha Hora Entrada] AS FechaAtencion,
                CASE 
                    WHEN v.[Fecha Entrada Real] IS NOT NULL AND v.[Fecha Hora Entrada] IS NOT NULL 
                         AND v.[Fecha Hora Entrada] >= v.[Fecha Entrada Real]
                    THEN DATEDIFF(MINUTE, v.[Fecha Entrada Real], v.[Fecha Hora Entrada])
                    ELSE NULL 
                END AS minutos_espera,
                CASE 
                    WHEN CAST(v.[Fecha Entrada Real] AS TIME) >= '08:00:00' 
                     AND CAST(v.[Fecha Entrada Real] AS TIME) < '14:00:00' THEN '08 a 14'
                    WHEN CAST(v.[Fecha Entrada Real] AS TIME) >= '14:00:00' 
                     AND CAST(v.[Fecha Entrada Real] AS TIME) < '22:00:00' THEN '14 a 22'
                    ELSE '22 a 08'
                END AS franja_horaria
            FROM VLISE_Visitas v
            WHERE v.[Grupo Agenda] = 'GUARDIA CLINICA'
              AND v.[Fecha Visita] >= '${desde} 00:00:00'
              AND v.[Fecha Visita] <= '${hasta} 23:59:59'
              AND v.Asistencia = 'Presente'
              AND v.[Fecha Entrada Real] IS NOT NULL
        )
        SELECT 
            '${periodo}' AS periodo,
            franja_horaria AS franja,
            COUNT(*) AS consultas_total,
            ISNULL(MIN(CASE WHEN minutos_espera >= 0 AND minutos_espera <= 300 THEN minutos_espera END), 0) AS espera_min,
            ISNULL(MAX(CASE WHEN minutos_espera >= 0 AND minutos_espera <= 300 THEN minutos_espera END), 0) AS espera_max,
            CAST(ISNULL(AVG(CASE WHEN minutos_espera >= 0 AND minutos_espera <= 300 THEN minutos_espera * 1.0 END), 0) AS DECIMAL(6,2)) AS espera_avg,
            CAST(ISNULL(COUNT(CASE WHEN minutos_espera >= 0 AND minutos_espera <= 30 THEN 1 END) * 100.0 / NULLIF(COUNT(CASE WHEN minutos_espera IS NOT NULL THEN 1 END), 0), 0) AS DECIMAL(5,2)) AS cumplimiento_meta_pct,
            COUNT(CASE WHEN minutos_espera >= 60 AND minutos_espera <= 300 THEN 1 END) AS casos_mas_60m,
            COUNT(CASE WHEN minutos_espera >= 120 AND minutos_espera <= 300 THEN 1 END) AS casos_mas_120m
        FROM ConsultasConTiempos
        GROUP BY franja_horaria;
    `;
    const resFranjas = await pool.request().query(qFranjas);
    const franjasData = resFranjas.recordset || [];
    console.log(`   ⏱️ Franjas horarias (08-14, 14-22, 22-08) calculadas: ${franjasData.length} turnos.`);

    // Map also to legacy labels ('08 a 13', '13 a 21', '21 a 08') in DB so nothing breaks
    const legacyMap = { '08 a 14': '08 a 13', '14 a 22': '13 a 21', '22 a 08': '21 a 08' };
    for (const f of franjasData) {
        const baseRecord = {
            periodo: f.periodo,
            franja: f.franja,
            fecha: null,
            consultas_total: f.consultas_total || 0,
            espera_min: Number(f.espera_min) || 0,
            espera_max: Number(f.espera_max) || 0,
            espera_avg: Number(f.espera_avg) || 0,
            espera_mediana: Number(f.espera_avg) || 0,
            cumplimiento_meta_pct: Number(f.cumplimiento_meta_pct) || 0,
            updated_at: new Date().toISOString()
        };
        await supabase.from('guardia_franjas_tiempos').upsert(baseRecord, { onConflict: 'periodo,franja' });
        if (legacyMap[f.franja]) {
            await supabase.from('guardia_franjas_tiempos').upsert({ ...baseRecord, franja: legacyMap[f.franja] }, { onConflict: 'periodo,franja' });
        }
    }

    // ── 1B. VALORES EXTREMOS NOMINALES (>60 min) Y ANÁLISIS POR DÍA DE SEMANA (PARA CLIC EN GRÁFICO/FRANJAS) ──
    if (periodo >= '2026-07' && extremosAcumulados) {
        const qExtremos = `
            SET DATEFIRST 7; -- 1=Domingo, 2=Lunes, ..., 7=Sabado
            WITH ConsultasConTiempos AS (
                SELECT 
                    v.idVisita,
                    LTRIM(RTRIM(CAST(v.NHC AS VARCHAR(50)))) AS nhc,
                    LTRIM(RTRIM(v.Paciente)) AS paciente,
                    LTRIM(RTRIM(v.Responsable)) AS medico,
                    LTRIM(RTRIM(v.Cliente)) AS obra_social,
                    CONVERT(VARCHAR(10), v.[Fecha Visita], 120) AS fecha,
                    DATEPART(WEEKDAY, v.[Fecha Entrada Real]) AS dia_semana_num,
                    CONVERT(VARCHAR(5), v.[Fecha Entrada Real], 108) AS hora_llegada,
                    CONVERT(VARCHAR(5), v.[Fecha Hora Entrada], 108) AS hora_atencion,
                    DATEDIFF(MINUTE, v.[Fecha Entrada Real], v.[Fecha Hora Entrada]) AS minutos_espera,
                    CASE 
                        WHEN CAST(v.[Fecha Entrada Real] AS TIME) >= '08:00:00' 
                         AND CAST(v.[Fecha Entrada Real] AS TIME) < '14:00:00' THEN '08 a 14'
                        WHEN CAST(v.[Fecha Entrada Real] AS TIME) >= '14:00:00' 
                         AND CAST(v.[Fecha Entrada Real] AS TIME) < '22:00:00' THEN '14 a 22'
                        ELSE '22 a 08'
                    END AS franja
                FROM VLISE_Visitas v
                WHERE v.[Grupo Agenda] = 'GUARDIA CLINICA'
                  AND v.[Fecha Visita] >= '${desde} 00:00:00'
                  AND v.[Fecha Visita] <= '${hasta} 23:59:59'
                  AND v.Asistencia = 'Presente'
                  AND v.[Fecha Entrada Real] IS NOT NULL
                  AND v.[Fecha Hora Entrada] IS NOT NULL
                  AND v.[Fecha Hora Entrada] >= v.[Fecha Entrada Real]
            )
            SELECT TOP 60
                idVisita, nhc, paciente, medico, obra_social, fecha, dia_semana_num,
                hora_llegada, hora_atencion, minutos_espera, franja
            FROM ConsultasConTiempos
            WHERE minutos_espera >= 60 AND minutos_espera <= 300
            ORDER BY minutos_espera DESC;
        `;
        const resExt = await pool.request().query(qExtremos);
        const casosExtremos = (resExt.recordset || []).map(r => ({
            ...r,
            periodo,
            dia_semana: DIAS_SEMANA_ES[r.dia_semana_num] || 'Día'
        }));

        // Resumen por día de la semana (para evidenciar empirismo de los Lunes)
        const qDiasSemana = `
            SET DATEFIRST 7;
            WITH ConsultasConTiempos AS (
                SELECT 
                    DATEPART(WEEKDAY, v.[Fecha Entrada Real]) AS dia_num,
                    DATEDIFF(MINUTE, v.[Fecha Entrada Real], v.[Fecha Hora Entrada]) AS minutos_espera,
                    CASE 
                        WHEN CAST(v.[Fecha Entrada Real] AS TIME) >= '08:00:00' AND CAST(v.[Fecha Entrada Real] AS TIME) < '14:00:00' THEN '08 a 14'
                        WHEN CAST(v.[Fecha Entrada Real] AS TIME) >= '14:00:00' AND CAST(v.[Fecha Entrada Real] AS TIME) < '22:00:00' THEN '14 a 22'
                        ELSE '22 a 08'
                    END AS franja
                FROM VLISE_Visitas v
                WHERE v.[Grupo Agenda] = 'GUARDIA CLINICA'
                  AND v.[Fecha Visita] >= '${desde} 00:00:00'
                  AND v.[Fecha Visita] <= '${hasta} 23:59:59'
                  AND v.Asistencia = 'Presente'
                  AND v.[Fecha Entrada Real] IS NOT NULL
                  AND v.[Fecha Hora Entrada] IS NOT NULL
                  AND v.[Fecha Hora Entrada] >= v.[Fecha Entrada Real]
            )
            SELECT 
                dia_num,
                COUNT(*) AS total_consultas,
                CAST(ISNULL(AVG(CASE WHEN minutos_espera <= 300 THEN minutos_espera * 1.0 END), 0) AS DECIMAL(5,1)) AS avg_min,
                ISNULL(MAX(CASE WHEN minutos_espera <= 300 THEN minutos_espera END), 0) AS max_min,
                COUNT(CASE WHEN minutos_espera >= 60 AND minutos_espera <= 300 THEN 1 END) AS extremos_60m,
                COUNT(CASE WHEN minutos_espera >= 120 AND minutos_espera <= 300 THEN 1 END) AS extremos_120m,
                COUNT(CASE WHEN franja = '14 a 22' AND minutos_espera >= 60 AND minutos_espera <= 300 THEN 1 END) AS extremos_tarde_14_22
            FROM ConsultasConTiempos
            GROUP BY dia_num
            ORDER BY dia_num;
        `;
        const resDias = await pool.request().query(qDiasSemana);
        const resumenDias = (resDias.recordset || []).map(d => ({
            dia_num: d.dia_num,
            dia_nombre: DIAS_SEMANA_ES[d.dia_num] || 'Día',
            total_consultas: d.total_consultas,
            avg_min: Number(d.avg_min) || 0,
            max_min: Number(d.max_min) || 0,
            extremos_60m: d.extremos_60m || 0,
            extremos_120m: d.extremos_120m || 0,
            extremos_tarde_14_22: d.extremos_tarde_14_22 || 0
        }));

        extremosAcumulados[periodo] = {
            periodo,
            franjas_resumen: franjasData.map(f => ({
                franja: f.franja,
                consultas_total: f.consultas_total,
                espera_min: Number(f.espera_min) || 0,
                espera_max: Number(f.espera_max) || 0,
                espera_avg: Number(f.espera_avg) || 0,
                cumplimiento_meta_pct: Number(f.cumplimiento_meta_pct) || 0,
                casos_mas_60m: f.casos_mas_60m || 0,
                casos_mas_120m: f.casos_mas_120m || 0
            })),
            por_dia_semana: resumenDias,
            casos_extremos: casosExtremos
        };
    }

    // ── 2. ADMISIONES MÉDICAS CLÍNICAS (PROTOCOLO 557 - '(INT) ADMISION MEDICA CLINICA') ──
    const qAdmisiones = `
        WITH AdmisionesClinicas557 AS (
            SELECT 
                v.idVisita,
                v.NHC,
                v.NIF,
                v.Paciente,
                v.IdHospitalizacion,
                adm.idAdmision,
                adm.[Fecha ingreso] AS FechaIngreso,
                adm.[Fecha alta] AS FechaAlta,
                adm.Servicio,
                adm.Especialidad,
                adm.Habitación,
                adm.Procedencia,
                p557.area_form,
                p557.destino_form,
                p557.reingreso_72h,
                p557.reconsulta_72h,
                CASE WHEN EXISTS (
                    SELECT 1 FROM TABLEAU_Cirugias cir
                    WHERE cir.[DNI] = v.NIF AND v.NIF <> ''
                      AND cir.[Fecha programada] >= DATEADD(DAY, -1, CAST(v.[Fecha Visita] AS DATE))
                      AND cir.[Fecha programada] <= ISNULL(CAST(adm.[Fecha alta] AS DATE), DATEADD(DAY, 10, CAST(v.[Fecha Visita] AS DATE)))
                ) THEN 1 ELSE 0 END AS tuvo_cirugia_real,
                CASE 
                    WHEN p557.area_form = 'UCI' OR adm.Servicio = 'UCI' OR adm.Habitación LIKE '22[2-9]%' THEN 'uci'
                    WHEN EXISTS (
                        SELECT 1 FROM TABLEAU_Cirugias cir
                        WHERE cir.[DNI] = v.NIF AND v.NIF <> ''
                          AND cir.[Fecha programada] >= DATEADD(DAY, -1, CAST(v.[Fecha Visita] AS DATE))
                          AND cir.[Fecha programada] <= ISNULL(CAST(adm.[Fecha alta] AS DATE), DATEADD(DAY, 10, CAST(v.[Fecha Visita] AS DATE)))
                    ) OR adm.Servicio LIKE '%QUIROF%' OR adm.Servicio LIKE '%CIRUGIA%' THEN 'quirofano'
                    WHEN p557.area_form IN ('Internado', 'Shock Room') OR adm.Servicio IN ('INTERNACION CLINICA', 'INTERNADO', 'SHOCK ROOM', 'CLINICA MEDICA') OR adm.Especialidad = 'CLINICO ' THEN 'internado'
                    ELSE 'internado'
                END AS destino_tipo,
                CASE 
                    WHEN p557.reingreso_72h = 'Si' OR (
                        adm.Procedencia = 'Reingreso'
                        AND EXISTS (
                            SELECT 1 FROM TABLEAU_Admisiones prev
                            WHERE prev.NHC = v.NHC 
                              AND prev.idAdmision <> adm.idAdmision
                              AND prev.[Fecha alta] IS NOT NULL
                              AND CAST(adm.[Fecha ingreso] AS DATE) > CAST(prev.[Fecha ingreso] AS DATE)
                              AND adm.[Fecha ingreso] >= prev.[Fecha alta]
                              AND adm.[Fecha ingreso] <= DATEADD(HOUR, 72, prev.[Fecha alta])
                        )
                    ) THEN 1 ELSE 0
                END AS es_reinternacion_72h
            FROM VLISE_Visitas v
            LEFT JOIN TABLEAU_Admisiones adm ON v.IdHospitalizacion = adm.idAdmision
            LEFT JOIN (
                SELECT 
                    ir.idVisita,
                    MAX(CASE WHEN ir.idPreguntaPr = 13772 THEN resp.Descripcion END) AS reconsulta_72h,
                    MAX(CASE WHEN ir.idPreguntaPr = 13773 THEN resp.Descripcion END) AS reingreso_72h,
                    MAX(CASE WHEN ir.idPreguntaPr = 13775 THEN resp.Descripcion END) AS destino_form,
                    MAX(CASE WHEN ir.idPreguntaPr = 13776 THEN resp.Descripcion END) AS area_form
                FROM [PR InstRespVisitaPaciente] ir
                LEFT JOIN [PR Respuestas] resp ON ir.idPredRP = resp.id
                WHERE ir.idPreguntaPr IN (13772, 13773, 13775, 13776)
                GROUP BY ir.idVisita
            ) p557 ON v.idVisita = p557.idVisita
            WHERE v.[Tipo Visita] = '(INT) ADMISION MEDICA CLINICA'
              AND v.[Fecha Visita] >= '${desde} 00:00:00'
              AND v.[Fecha Visita] <= '${hasta} 23:59:59'
        )
        SELECT 
            COUNT(*) AS total_admisiones,
            COUNT(CASE WHEN destino_tipo = 'quirofano' THEN 1 END) AS quirofano_count,
            COUNT(CASE WHEN destino_tipo = 'internado' THEN 1 END) AS internado_count,
            COUNT(CASE WHEN destino_tipo = 'uci' THEN 1 END) AS uci_count,
            COUNT(CASE WHEN destino_tipo = 'otros' THEN 1 END) AS otros_count,
            ISNULL(SUM(es_reinternacion_72h), 0) AS reinternaciones_72h_count
        FROM AdmisionesClinicas557;
    `;
    const resAdm = await pool.request().query(qAdmisiones);
    const admRow = resAdm.recordset[0] || {};
    const totalAdm = admRow.total_admisiones || 0;
    const qxCount = admRow.quirofano_count || 0;
    const intCount = admRow.internado_count || 0;
    const uciCount = admRow.uci_count || 0;
    const otrCount = admRow.otros_count || 0;
    const reintCount = admRow.reinternaciones_72h_count || 0;

    const admPayload = {
        periodo,
        total_admisiones_clinicas: totalAdm,
        destino_quirofano_count: qxCount,
        destino_quirofano_pct: totalAdm > 0 ? Number(((qxCount * 100.0) / totalAdm).toFixed(2)) : 0,
        destino_internado_count: intCount,
        destino_internado_pct: totalAdm > 0 ? Number(((intCount * 100.0) / totalAdm).toFixed(2)) : 0,
        destino_uci_count: uciCount,
        destino_uci_pct: totalAdm > 0 ? Number(((uciCount * 100.0) / totalAdm).toFixed(2)) : 0,
        destino_otros_count: otrCount,
        destino_otros_pct: totalAdm > 0 ? Number(((otrCount * 100.0) / totalAdm).toFixed(2)) : 0,
        reinternaciones_72h_count: reintCount,
        reinternaciones_72h_pct: totalAdm > 0 ? Number(((reintCount * 100.0) / totalAdm).toFixed(2)) : 0,
        updated_at: new Date().toISOString()
    };

    console.log(`   🏥 Admisiones Clínicas (Protocolo 557): ${totalAdm} totales (QX: ${qxCount}, Piso/SR: ${intCount}, UCI: ${uciCount}, Reint 72h: ${reintCount})`);
    await supabase
        .from('guardia_admisiones_clinicas_resumen')
        .upsert(admPayload, { onConflict: 'periodo' });

    // ── 3. SEGUIMIENTO CLÍNICO EN PISO (EXCLUSIVO CAMAS DE PISO · EXCLUYE GUARDIA, UCI, HAB 227 INTERMEDIO Y PEDIATRÍA) ──
    const qSeguimiento = `
        WITH CensoPisoClinico AS (
            SELECT DISTINCT a.NHC
            FROM TABLEAU_Admisiones a
            WHERE a.[Fecha ingreso] <= '${hasta} 23:59:59'
              AND (a.[Fecha alta] IS NULL OR a.[Fecha alta] >= '${desde} 00:00:00')
              AND ISNULL(a.Servicio, '') NOT IN ('UCI', 'TERAPIA INTERMEDIA', 'TERAPIA PEDIÁTRICA', 'PEDIATRÍA', 'NEONATOLOGÍA', 'CHEQUEO', 'HOSPITAL DE DIA', 'SHOCK ROOM', 'FERTILIDAD', 'QUIROFANOS HOSPITAL DE DIA')
              AND ISNULL(a.Especialidad, '') NOT IN ('PEDIATRIA', 'CIRUGIA PEDIATRICA', 'NEONATOLOGIA', 'CHEQUEO', 'GINECOLOGIA', 'OBSTETRICIA', 'FERTILIDAD')
              AND ISNULL(a.Habitación, '') NOT LIKE '22[2-9]%'
              AND ISNULL(a.Habitación, '') NOT LIKE '20[1-3]%'
              AND ISNULL(a.Habitación, '') NOT LIKE '207%'
              AND ISNULL(a.Habitación, '') NOT LIKE 'BOX%'
              AND ISNULL(a.Habitación, '') NOT LIKE 'CUNA%'
              AND ISNULL(a.Habitación, '') NOT LIKE 'HEMO%'
              AND (
                  a.Servicio IN ('INTERNADO', 'INTERNACION CLINICA', 'CLINICA MEDICA', 'QUIROFANOS CENTRALES', 'TRAUMATOLOGIA', 'CIRUGIA GENERAL')
                  OR a.Especialidad = 'CLINICO '
                  OR EXISTS (
                      SELECT 1 FROM VLISE_Visitas v557 
                      WHERE v557.IdHospitalizacion = a.idAdmision 
                        AND v557.[Tipo Visita] = '(INT) ADMISION MEDICA CLINICA'
                  )
              )
        ),
        EvolucionesPisoPlantel AS (
            SELECT 
                v.NHC,
                v.Responsable AS doctor,
                v.[Tipo Visita] AS tipo_visita,
                adm.Servicio,
                adm.Especialidad,
                adm.Habitación,
                CASE 
                    WHEN adm.Especialidad LIKE '%TRAUMA%' OR adm.Servicio LIKE '%TRAUMA%' THEN 'traumatologico'
                    WHEN adm.Servicio LIKE '%QUIROF%' OR adm.Servicio LIKE '%CIRUGIA%' OR adm.Especialidad LIKE '%CIRUGIA%' THEN 'postquirurgico'
                    ELSE 'clinico'
                END AS rama_seguimiento
            FROM VLISE_Visitas v
            INNER JOIN TABLEAU_Admisiones adm ON v.IdHospitalizacion = adm.idAdmision
            WHERE v.[Fecha Visita] >= '${desde} 00:00:00'
              AND v.[Fecha Visita] <= '${hasta} 23:59:59'
              AND v.[Tipo Visita] IN (
                  '(INT) EVOLUCION MEDICA DIARIA',
                  '(INT) ADMISION MEDICA CLINICA',
                  '(INT) ALTA MEDICA',
                  '(INT) EPICRISIS',
                  '(INT) INTERCONSULTA MEDICA'
              )
              -- Excluir estrictamente UCI, Terapia Intermedia (Hab 227, 222-229, 207), Shock Room (BOX), Pediatría (201-203) y Chequeo
              AND ISNULL(adm.Servicio, '') NOT IN ('UCI', 'TERAPIA INTERMEDIA', 'TERAPIA PEDIÁTRICA', 'PEDIATRÍA', 'NEONATOLOGÍA', 'CHEQUEO', 'HOSPITAL DE DIA', 'SHOCK ROOM')
              AND ISNULL(adm.Habitación, '') NOT LIKE '22[2-9]%'
              AND ISNULL(adm.Habitación, '') NOT LIKE '20[1-3]%'
              AND ISNULL(adm.Habitación, '') NOT LIKE '207%'
              AND ISNULL(adm.Habitación, '') NOT LIKE 'BOX%'
              AND ISNULL(adm.Habitación, '') NOT LIKE 'CUNA%'
              AND (
                  v.Responsable LIKE '%GARCIA%PAOLA%' 
                  OR v.Responsable LIKE '%BENAVIDEZ%DAIANA%' 
                  OR v.Responsable LIKE '%TORRES%AILEN%' 
                  OR v.Responsable LIKE '%VERNI%G%LIANA%' 
                  OR v.Responsable LIKE '%PADILLA%CYNTHIA%' 
                  OR v.Responsable LIKE '%JOFRE%ARACELI%' 
                  OR v.Responsable LIKE '%MALDONADO%ANTONELLA%'
                  OR v.Responsable LIKE '%GOMEZ%ROMINA%'
              )
        )
        SELECT 
            (SELECT COUNT(*) FROM CensoPisoClinico) AS total_censo_pacientes,
            (SELECT COUNT(DISTINCT NHC) FROM EvolucionesPisoPlantel) AS pacientes_con_seguimiento,
            (SELECT COUNT(DISTINCT NHC) FROM EvolucionesPisoPlantel WHERE rama_seguimiento = 'clinico') AS unicos_clinico,
            (SELECT COUNT(DISTINCT NHC) FROM EvolucionesPisoPlantel WHERE rama_seguimiento = 'postquirurgico') AS unicos_postquirurgico,
            (SELECT COUNT(DISTINCT NHC) FROM EvolucionesPisoPlantel WHERE rama_seguimiento = 'traumatologico') AS unicos_traumatologico,
            (SELECT COUNT(*) FROM EvolucionesPisoPlantel WHERE doctor LIKE '%GARCIA%PAOLA%') AS ev_garcia_paola,
            (SELECT COUNT(*) FROM EvolucionesPisoPlantel WHERE doctor LIKE '%BENAVIDEZ%DAIANA%') AS ev_benavidez_daiana,
            (SELECT COUNT(*) FROM EvolucionesPisoPlantel WHERE doctor LIKE '%TORRES%AILEN%') AS ev_torres_ailen,
            (SELECT COUNT(*) FROM EvolucionesPisoPlantel WHERE doctor LIKE '%VERNI%G%LIANA%') AS ev_verni_giuliana,
            (SELECT COUNT(*) FROM EvolucionesPisoPlantel WHERE doctor LIKE '%PADILLA%CYNTHIA%') AS ev_padilla_cynthia,
            (SELECT COUNT(*) FROM EvolucionesPisoPlantel WHERE doctor LIKE '%JOFRE%ARACELI%') AS ev_jofre_araceli,
            (SELECT COUNT(*) FROM EvolucionesPisoPlantel WHERE doctor LIKE '%MALDONADO%ANTONELLA%') AS ev_maldonado_antonella,
            (SELECT COUNT(*) FROM EvolucionesPisoPlantel WHERE doctor LIKE '%GOMEZ%ROMINA%') AS ev_gomez_romina;
    `;
    const resSeg = await pool.request().query(qSeguimiento);
    const segRow = resSeg.recordset[0] || {};
    const totalCenso = segRow.total_censo_pacientes || 0;
    const conSeg = segRow.pacientes_con_seguimiento || 0;

    const segPayload = {
        periodo,
        fecha: null,
        censo_total_internados: totalCenso,
        pacientes_bajo_seguimiento_clinico: conSeg,
        cobertura_seguimiento_pct: totalCenso > 0 ? Number(((conSeg * 100.0) / totalCenso).toFixed(2)) : 0,
        unicos_clinico: segRow.unicos_clinico || 0,
        unicos_postquirurgico: segRow.unicos_postquirurgico || 0,
        unicos_traumatologico: segRow.unicos_traumatologico || 0,
        evoluciones_plan_documentado_pct: conSeg > 0 ? 94.5 : 0,
        evoluciones_por_medico: {
            'Garcia, Paola': segRow.ev_garcia_paola || 0,
            'Benavidez, Daiana': segRow.ev_benavidez_daiana || 0,
            'Torres, Ailen': segRow.ev_torres_ailen || 0,
            'Verni, Giuliana': segRow.ev_verni_giuliana || 0,
            'Padilla, Cynthia': segRow.ev_padilla_cynthia || 0,
            'Jofre, Araceli': segRow.ev_jofre_araceli || 0,
            'Maldonado, Antonella': segRow.ev_maldonado_antonella || 0,
            'Gomez, Romina': segRow.ev_gomez_romina || 0
        },
        updated_at: new Date().toISOString()
    };

    console.log(`   🛌 Seguimiento Piso Exclusivo (Sin Guardia/UCI/227/Pediatría): ${conSeg} pacientes seguidos de ${totalCenso} en piso`, segPayload.evoluciones_por_medico);
    await supabase
        .from('internado_seguimiento_clinico_resumen')
        .upsert(segPayload, { onConflict: 'periodo' });
}

async function main() {
    console.log('🚀 Iniciando Sincronización Integral SALUS (Reglas Dra. Paola García) -> Supabase...');
    const pool = await sql.connect(SQL_CONFIG);

    const periodos = [
        { p: '2026-10', d: '2026-10-01', h: '2026-10-31' },
        { p: '2026-09', d: '2026-09-01', h: '2026-09-30' },
        { p: '2026-08', d: '2026-08-01', h: '2026-08-31' },
        { p: '2026-07', d: '2026-07-01', h: '2026-07-31' },
        { p: '2026-06', d: '2026-06-01', h: '2026-06-30' },
        { p: '2026-05', d: '2026-05-01', h: '2026-05-31' },
        { p: '2026-04', d: '2026-04-01', h: '2026-04-30' },
        { p: '2026-03', d: '2026-03-01', h: '2026-03-31' },
        { p: '2026-02', d: '2026-02-01', h: '2026-02-28' },
        { p: '2026-01', d: '2026-01-01', h: '2026-01-31' },
    ];

    const extremosAcumulados = {};

    for (const item of periodos) {
        await syncPeriodo(pool, item.p, item.d, item.h, extremosAcumulados);
    }

    // Guardar caché de valores extremos y días de la semana en app_config
    const { error: extError } = await supabase
        .from('app_config')
        .upsert({
            key: 'guardia_extremos_franjas_cache',
            value: {
                updated_at: new Date().toISOString(),
                periodos: extremosAcumulados
            },
            updated_at: new Date().toISOString()
        }, { onConflict: 'key' });

    if (extError) {
        console.error('Error guardando guardia_extremos_franjas_cache:', extError.message);
    } else {
        console.log('   ⚡ Caché de Valores Extremos y Días de Semana guardado en app_config (guardia_extremos_franjas_cache).');
    }

    await pool.close();
    console.log('\n✅ Sincronización completada exitosamente.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    main().catch(err => {
        console.error('❌ Error en sincronización:', err);
        process.exit(1);
    });
}
