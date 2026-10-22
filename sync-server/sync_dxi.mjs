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
    }
};

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://hakysnqiryimxbwdslwe.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Obtiene el resumen analítico completo de Diagnóstico por Imágenes desde SALUS
 * supeditado al rango de fechas proporcionado (compatible con filtros del Telar).
 * Ejecuta en un solo pase ultrarrápido con tabla temporal en memoria (< 5 segundos).
 */
export async function getDxIAnalytics({ fechaDesde = '2022-01-01', fechaHasta, modalidad, agenda } = {}) {
    const pool = await sql.connect(SQL_CONFIG);

    try {
        let hasta = (fechaHasta || '').toString().trim() || new Date().toISOString().substring(0, 10);
        let desde = (fechaDesde || '').toString().trim() || '2022-01-01';

        // Validar formato YYYY-MM-DD y rango razonable de año para evitar error MSSQL out-of-range
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(desde) || parseInt(desde.substring(0, 4), 10) < 2000 || parseInt(desde.substring(0, 4), 10) > 2099) {
            console.warn(`[getDxIAnalytics] fechaDesde fuera de rango o parcial: "${fechaDesde}". Normalizando a 2026-10-01`);
            desde = '2026-10-01';
        }
        if (!dateRegex.test(hasta) || parseInt(hasta.substring(0, 4), 10) < 2000 || parseInt(hasta.substring(0, 4), 10) > 2099) {
            console.warn(`[getDxIAnalytics] fechaHasta fuera de rango o parcial: "${fechaHasta}". Normalizando a 2026-10-31`);
            hasta = '2026-10-31';
        }
        if (desde > hasta) {
            const tmp = desde;
            desde = hasta;
            hasta = tmp;
        }

        console.log(`[getDxIAnalytics] Consultando SALUS en un solo pase desde ${desde} hasta ${hasta}...`);
        const t0 = Date.now();

        const batchQuery = `
            -- 1. Filtrar una sola vez al espacio temporal indexado
            SELECT 
                CONVERT(VARCHAR(10), [Fecha Solicitud], 120) AS FechaDia,
                CONVERT(VARCHAR(7), [Fecha Solicitud], 120) AS PeriodoMes,
                CASE 
                    WHEN [Tipo Visita] LIKE '(ECO)%' OR Prueba LIKE '%ECOGRAF%' OR Prueba LIKE '%DOPPLER%' THEN 'ECOGRAFIA'
                    WHEN [Tipo Visita] LIKE '(RX) MA%' OR Prueba LIKE '%MAMOGRAF%' THEN 'MAMOGRAFIA'
                    WHEN [Tipo Visita] LIKE '(RX) DE%' OR Prueba LIKE '%DENSITO%' THEN 'DENSITOMETRIA'
                    WHEN [Tipo Visita] LIKE '(TC)%' OR Prueba LIKE '%TOMOGRAF%' OR Prueba LIKE '%TC %' OR Prueba LIKE '%TAC%' THEN 'TOMOGRAFIA'
                    WHEN [Tipo Visita] LIKE '(RX)%' OR [Tipo Visita] LIKE '(CX) RA%' OR Prueba LIKE '%RADIOGRAF%' OR Prueba LIKE '%RAYOS%' THEN 'RADIOLOGIA'
                    ELSE 'OTRAS'
                END AS Modalidad,
                ISNULL([Tipo Visita], 'SIN AGENDA') AS Agenda,
                ISNULL(VIS_Centro, 'CENTRO NO ESPECIFICADO') AS Centro,
                ISNULL(Responsable, 'SIN ASIGNAR / INSTITUCIONAL') AS Responsable,
                ISNULL(Solicitante, 'NO ESPECIFICADO / EXTERNO') AS Solicitante,
                ISNULL(Cliente, 'PARTICULAR / SIN FINANCIADOR') AS ObraSocial,
                ISNULL(NULLIF(RTRIM(LTRIM(Asistencia)), ''), 'SIN REGISTRAR') AS AsistenciaOriginal,
                CASE 
                    WHEN Asistencia = 'Presente' THEN 'Presente'
                    WHEN Asistencia = 'INTERNADO' THEN 'Internado'
                    WHEN Asistencia = 'URGENCIA' THEN 'Urgencia'
                    WHEN Asistencia = 'SOBRETURNO' THEN 'Sobreturno'
                    WHEN Asistencia IN ('Ausencia justificada', 'Ausencia injustificada') THEN 'Ausente'
                    WHEN Asistencia LIKE '%SUSPENDIDA%' OR Asistencia LIKE '%Anulación%' OR Asistencia LIKE '%CANCEL%' THEN 'Cancelada'
                    WHEN Asistencia IS NULL OR RTRIM(LTRIM(Asistencia)) = '' THEN 'Sin Registrar'
                    ELSE Asistencia
                END AS EstadoAsistencia,
                CASE 
                    WHEN Asistencia IN ('Presente', 'URGENCIA', 'SOBRETURNO') THEN 'Ambulatorio'
                    WHEN Asistencia = 'INTERNADO' THEN 'Hospitalización'
                    WHEN Asistencia IN ('Ausencia justificada', 'Ausencia injustificada', 'SUSPENDIDA') THEN 'No Realizado'
                    ELSE 'Ambulatorio'
                END AS Ambito,
                CASE WHEN [Fecha Informado] IS NOT NULL THEN 1 ELSE 0 END AS EstaInformado
            INTO #TempDxI
            FROM VLIS_PeticionesPruebas_ARGENTINA WITH (NOLOCK)
            WHERE [Fecha Solicitud] >= @desde AND [Fecha Solicitud] <= @hasta
              AND Prueba NOT LIKE '%*** PETICION RADIOLOGÍA%'
              AND (
                  [Tipo Visita] LIKE '(ECO)%' 
                  OR [Tipo Visita] LIKE '(RX)%' 
                  OR [Tipo Visita] LIKE '(TC)%'
                  OR [Tipo Visita] LIKE '(CX) RA%'
              )
              AND ([Tipo Visita] NOT LIKE '%(TC) MEDIO DE CONTRASTE%' OR [Tipo Visita] IS NULL)
              AND ISNULL(Prueba, '') NOT LIKE '%CONTRASTE%'
              AND ISNULL(Prueba, '') NOT LIKE '%AGUJA%';

            -- Set 0: Agendas con Totales, Ambito, Estado de Asistencia e Informe
            SELECT Modalidad, Agenda, Centro, Ambito, EstadoAsistencia, AsistenciaOriginal, COUNT(*) AS Cantidad,
                   SUM(EstaInformado) AS Informados,
                   SUM(CASE WHEN EstaInformado = 0 THEN 1 ELSE 0 END) AS PendientesInforme
            FROM #TempDxI
            GROUP BY Modalidad, Agenda, Centro, Ambito, EstadoAsistencia, AsistenciaOriginal;

            -- Set 1: Prestadores que la Realizan (con EstadoAsistencia para priorizar efectivos)
            SELECT Modalidad, Agenda, Responsable AS PrestadorRealiza, EstadoAsistencia, COUNT(*) AS Cantidad
            FROM #TempDxI
            GROUP BY Modalidad, Agenda, Responsable, EstadoAsistencia;

            -- Set 2: Prestadores que la Solicitan (con EstadoAsistencia)
            SELECT Modalidad, Agenda, Solicitante AS PrestadorSolicita, EstadoAsistencia, COUNT(*) AS Cantidad
            FROM #TempDxI
            GROUP BY Modalidad, Agenda, Solicitante, EstadoAsistencia;

            -- Set 3: Prestadores que la Informan (solo estudios firmados/informados)
            SELECT Modalidad, Agenda, Responsable AS PrestadorInforma, COUNT(*) AS Cantidad
            FROM #TempDxI
            WHERE EstaInformado = 1
            GROUP BY Modalidad, Agenda, Responsable;

            -- Set 4: Obras Sociales (con EstadoAsistencia)
            SELECT Modalidad, Agenda, ObraSocial, EstadoAsistencia, COUNT(*) AS Cantidad
            FROM #TempDxI
            GROUP BY Modalidad, Agenda, ObraSocial, EstadoAsistencia;

            -- Set 5: Evolución Temporal (Día, Mes, Modalidad, Ámbito, Asistencia)
            SELECT FechaDia, PeriodoMes, Modalidad, Ambito, EstadoAsistencia, COUNT(*) AS Cantidad
            FROM #TempDxI
            GROUP BY FechaDia, PeriodoMes, Modalidad, Ambito, EstadoAsistencia
            ORDER BY FechaDia ASC;

            -- Set 6: Desglose Agregado por Estado de Asistencia
            SELECT Modalidad, Agenda, EstadoAsistencia, AsistenciaOriginal, COUNT(*) AS Cantidad
            FROM #TempDxI
            GROUP BY Modalidad, Agenda, EstadoAsistencia, AsistenciaOriginal
            ORDER BY Cantidad DESC;

            DROP TABLE #TempDxI;
        `;

        const res = await pool.request()
            .input('desde', sql.VarChar, `${desde} 00:00:00`)
            .input('hasta', sql.VarChar, `${hasta} 23:59:59`)
            .query(batchQuery);

        const elapsed = Date.now() - t0;
        console.log(`[getDxIAnalytics] Consulta completada en ${elapsed}ms. Resultsets: ${res.recordsets.length}`);

        const payload = {
            rango: { fechaDesde: desde, fechaHasta: hasta },
            elapsedMs: elapsed,
            agendas: res.recordsets[0] || [],
            realizadores: res.recordsets[1] || [],
            solicitantes: res.recordsets[2] || [],
            informantes: res.recordsets[3] || [],
            obrasSociales: res.recordsets[4] || [],
            evolucion: res.recordsets[5] || [],
            asistencias: res.recordsets[6] || [],
            ultima_actualizacion: new Date().toISOString()
        };

        // Cachear en Supabase app_config
        try {
            await supabase.from('app_config').upsert({
                key: 'dxi_analytics_cache',
                value: JSON.stringify(payload),
                label: 'Caché de Analítica de Diagnóstico por Imágenes (DxI)',
                category: 'gobernanza_dxi',
                is_secret: false,
                updated_at: new Date().toISOString(),
                updated_by: 'sync_dxi.mjs'
            }, { onConflict: 'key' });
        } catch (sbErr) {
            console.warn('[getDxIAnalytics] Warning al guardar en app_config:', sbErr.message);
        }

        return payload;
    } finally {
        await pool.close();
    }
}
