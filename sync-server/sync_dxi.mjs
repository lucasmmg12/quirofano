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
            -- 1. Pre-agregar informes LIS por idVisita usando el índice de [Fecha Solicitud]
            SELECT 
                idVisita,
                MAX(CASE WHEN [Fecha Informado] IS NOT NULL OR [Fecha Firma] IS NOT NULL THEN 1 ELSE 0 END) AS EstaInformado,
                MAX(NULLIF(RTRIM(LTRIM(Solicitante)), '')) AS SolicitanteLIS
            INTO #InformesVisitas
            FROM [SALUS].[dbo].[VLIS_PeticionesPruebas_ARGENTINA] WITH (NOLOCK)
            WHERE [Fecha Solicitud] >= DATEADD(day, -45, CAST(@desde AS DATETIME))
              AND [Fecha Solicitud] <= DATEADD(day, 15, CAST(@hasta AS DATETIME))
              AND idVisita IS NOT NULL
              AND ISNULL(Prueba, '') NOT LIKE '%*** PETICION RADIOLOGÍA%'
              AND ISNULL(Prueba, '') NOT LIKE '%CONTRASTE%'
              AND ISNULL(Prueba, '') NOT LIKE '%AGUJA%'
            GROUP BY idVisita;

            CREATE CLUSTERED INDEX IX_InfVis ON #InformesVisitas(idVisita);

            -- 2. Universo maestro de Estudios DxI en VLISE_Visitas (1 fila = 1 estudio por [Fecha Visita])
            SELECT 
                CONVERT(VARCHAR(10), v.[Fecha Visita], 120) AS FechaDia,
                CONVERT(VARCHAR(7), v.[Fecha Visita], 120) AS PeriodoMes,
                CASE 
                    WHEN v.[Grupo Agenda] = 'ECOCARDIO' THEN 'ECOCARDIO'
                    WHEN v.[Grupo Agenda] = 'ECOGRAFIAS' AND (ISNULL(v.[Tipo Visita], '') LIKE '(ECO)%' OR ISNULL(v.[Tipo Visita], '') LIKE '%ECOGRAF%' OR ISNULL(v.[Tipo Visita], '') LIKE '%DOPPLER%') THEN 'ECOGRAFIA'
                    WHEN v.[Grupo Agenda] = 'GUARDIAS ' AND (ISNULL(v.[Tipo Visita], '') LIKE '(ECO)%' OR ISNULL(v.[Tipo Visita], '') LIKE '%ECOGRAF%' OR ISNULL(v.[Tipo Visita], '') LIKE '%DOPPLER%') THEN 'ECOGRAFIA'
                    WHEN v.[Grupo Agenda] = 'TOMOGRAFIA' AND ISNULL(v.[Tipo Visita], '') LIKE '(TC)%' THEN 'TOMOGRAFIA'
                    WHEN v.[Grupo Agenda] = 'DENSITOMETRIA Y MAMOGRAFIA' AND ISNULL(v.[Tipo Visita], '') LIKE '%DENSITOMETR%' THEN 'DENSITOMETRIA'
                    WHEN v.[Grupo Agenda] IN ('MAMOGRAFIA', 'DENSITOMETRIA Y MAMOGRAFIA') AND ISNULL(v.[Tipo Visita], '') NOT LIKE '%DENSITOMETR%' AND ISNULL(v.[Tipo Visita], '') LIKE '(RX)%' THEN 'MAMOGRAFIA'
                    WHEN v.[Grupo Agenda] = 'RADIOLOGIA' THEN 'RADIOLOGIA'
                    ELSE 'OTRAS'
                END AS Modalidad,
                CASE 
                    WHEN v.[Grupo Agenda] = 'ECOCARDIO' AND (ISNULL(v.Agenda, '') LIKE '%GERBEC%' OR ISNULL(v.Responsable, '') LIKE '%GERBEC%') THEN 'ECOCARDIO (DRA. GERBEC)'
                    WHEN v.[Grupo Agenda] = 'ECOCARDIO' THEN 'ECOCARDIO (CARDIÓLOGOS)'
                    ELSE ISNULL(RTRIM(LTRIM(v.[Grupo Agenda])), 'SIN GRUPO')
                END AS GrupoAgenda,
                CASE 
                    WHEN v.[Grupo Agenda] IN ('ECOCARDIO', 'MAMOGRAFIA', 'DENSITOMETRIA Y MAMOGRAFIA', 'TOMOGRAFIA', 'RADIOLOGIA') THEN ISNULL(RTRIM(LTRIM(v.Agenda)), 'SIN AGENDA')
                    ELSE 'ECOGRAFÍAS (' + ISNULL(v.VIS_Centro, ISNULL(v.Centro, 'GRAL')) + ')'
                END AS AgendaSalus,
                ISNULL(v.[Tipo Visita], 'SIN AGENDA') AS Agenda,
                ISNULL(v.VIS_Centro, ISNULL(v.Centro, 'CENTRO NO ESPECIFICADO')) AS Centro,
                ISNULL(v.Responsable, 'SIN ASIGNAR / INSTITUCIONAL') AS Responsable,
                ISNULL(i.SolicitanteLIS, ISNULL(NULLIF(RTRIM(LTRIM(v.[Persona referidora])), ''), 'NO ESPECIFICADO / EXTERNO')) AS Solicitante,
                ISNULL(v.Cliente, 'PARTICULAR / SIN FINANCIADOR') AS ObraSocial,
                ISNULL(NULLIF(RTRIM(LTRIM(v.Asistencia)), ''), 'SIN REGISTRAR') AS AsistenciaOriginal,
                CASE 
                    WHEN v.Asistencia = 'Presente' THEN 'Presente'
                    WHEN v.Asistencia = 'INTERNADO' THEN 'Internado'
                    WHEN v.Asistencia = 'URGENCIA' THEN 'Urgencia'
                    WHEN v.Asistencia = 'SOBRETURNO' THEN 'Sobreturno'
                    WHEN v.Asistencia IN ('Ausencia justificada', 'Ausencia injustificada') THEN 'Ausente'
                    WHEN v.Asistencia LIKE '%SUSPENDIDA%' OR v.Asistencia LIKE '%Anulación%' OR v.Asistencia LIKE '%CANCEL%' THEN 'Cancelada'
                    WHEN v.Asistencia IS NULL OR RTRIM(LTRIM(v.Asistencia)) = '' THEN 'Sin Registrar'
                    ELSE v.Asistencia
                END AS EstadoAsistencia,
                CASE 
                    WHEN v.Asistencia IN ('Presente', 'URGENCIA', 'SOBRETURNO') THEN 'Ambulatorio'
                    WHEN v.Asistencia = 'INTERNADO' THEN 'Hospitalización'
                    WHEN v.Asistencia IN ('Ausencia justificada', 'Ausencia injustificada', 'SUSPENDIDA') THEN 'No Realizado'
                    ELSE 'Ambulatorio'
                END AS Ambito,
                ISNULL(i.EstaInformado, 0) AS EstaInformado
            INTO #TempDxI
            FROM [SALUS].[dbo].[VLISE_Visitas] v WITH (NOLOCK)
            LEFT JOIN #InformesVisitas i ON i.idVisita = v.idVisita
            WHERE v.[Fecha Visita] >= @desde AND v.[Fecha Visita] <= @hasta
              AND (
                  v.[Grupo Agenda] IN ('ECOGRAFIAS', 'ECOCARDIO', 'TOMOGRAFIA', 'MAMOGRAFIA', 'DENSITOMETRIA Y MAMOGRAFIA', 'RADIOLOGIA')
                  OR (v.[Grupo Agenda] = 'GUARDIAS ' AND (v.[Tipo Visita] LIKE '(ECO)%' OR v.[Tipo Visita] LIKE '%ECOGRAF%' OR v.[Tipo Visita] LIKE '%DOPPLER%'))
              )
              AND ISNULL(v.[Tipo Visita], '') NOT LIKE '%MEDIO DE CONTRASTE%'
              AND ISNULL(v.[Tipo Visita], '') NOT LIKE '%ADICIONAL POR%ANESTESIA%'
              AND ISNULL(v.[Tipo Visita], '') NOT LIKE '%MEDICI%N DE ESCOLIOSIS%'
              AND ISNULL(v.[Tipo Visita], '') NOT LIKE '%MEDICI%N DE MIEMBROS INFERIORES%';

            DELETE FROM #TempDxI WHERE Modalidad = 'OTRAS';

            -- Set 0: Agendas con Totales, Ambito, Estado de Asistencia e Informe (con PeriodoMes para filtrado en caché)
            -- Nota: Informados y PendientesInforme se contabilizan estrictamente sobre estudios efectivamente realizados
            SELECT PeriodoMes, Modalidad, GrupoAgenda, AgendaSalus, Agenda, Centro, Ambito, EstadoAsistencia, AsistenciaOriginal, COUNT(*) AS Cantidad,
                   SUM(CASE WHEN EstadoAsistencia IN ('Presente', 'Internado', 'Urgencia', 'Sobreturno') AND EstaInformado = 1 THEN 1 ELSE 0 END) AS Informados,
                   SUM(CASE WHEN EstadoAsistencia IN ('Presente', 'Internado', 'Urgencia', 'Sobreturno') AND EstaInformado = 0 THEN 1 ELSE 0 END) AS PendientesInforme
            FROM #TempDxI
            GROUP BY PeriodoMes, Modalidad, GrupoAgenda, AgendaSalus, Agenda, Centro, Ambito, EstadoAsistencia, AsistenciaOriginal;

            -- Set 1: Prestadores que la Realizan (por PeriodoMes y Modalidad para resumen general ultrarrápido)
            SELECT PeriodoMes, Modalidad, Responsable AS PrestadorRealiza, EstadoAsistencia, COUNT(*) AS Cantidad
            FROM #TempDxI
            GROUP BY PeriodoMes, Modalidad, Responsable, EstadoAsistencia;

            -- Set 2: Prestadores que la Solicitan (por PeriodoMes y Modalidad)
            SELECT PeriodoMes, Modalidad, Solicitante AS PrestadorSolicita, EstadoAsistencia, COUNT(*) AS Cantidad
            FROM #TempDxI
            GROUP BY PeriodoMes, Modalidad, Solicitante, EstadoAsistencia;

            -- Set 3: Prestadores que la Informan (solo estudios efectivamente realizados y firmados/informados, con PeriodoMes)
            SELECT PeriodoMes, Modalidad, Responsable AS PrestadorInforma, COUNT(*) AS Cantidad
            FROM #TempDxI
            WHERE EstaInformado = 1
              AND EstadoAsistencia IN ('Presente', 'Internado', 'Urgencia', 'Sobreturno')
            GROUP BY PeriodoMes, Modalidad, Responsable;

            -- Set 4: Obras Sociales (por PeriodoMes y Modalidad)
            SELECT PeriodoMes, Modalidad, ObraSocial, EstadoAsistencia, COUNT(*) AS Cantidad
            FROM #TempDxI
            GROUP BY PeriodoMes, Modalidad, ObraSocial, EstadoAsistencia;

            -- Set 5: Evolución Temporal (Día, Mes, Modalidad, Ámbito, Asistencia)
            SELECT FechaDia, PeriodoMes, Modalidad, Ambito, EstadoAsistencia, COUNT(*) AS Cantidad
            FROM #TempDxI
            GROUP BY FechaDia, PeriodoMes, Modalidad, Ambito, EstadoAsistencia
            ORDER BY FechaDia ASC;

            -- Set 6: Desglose Agregado por Estado de Asistencia (con PeriodoMes)
            SELECT PeriodoMes, Modalidad, EstadoAsistencia, AsistenciaOriginal, COUNT(*) AS Cantidad
            FROM #TempDxI
            GROUP BY PeriodoMes, Modalidad, EstadoAsistencia, AsistenciaOriginal
            ORDER BY Cantidad DESC;

            DROP TABLE #TempDxI;
            DROP TABLE #InformesVisitas;
        `;

        const res = await pool.request()
            .input('desde', sql.VarChar, `${desde} 00:00:00`)
            .input('hasta', sql.VarChar, `${hasta} 23:59:59`)
            .query(batchQuery);

        const elapsed = Date.now() - t0;
        console.log(`[getDxIAnalytics] Consulta completada en ${elapsed}ms. Resultsets: ${res.recordsets.length}`);

        // Compactar colas largas (1-2 estudios) por (PeriodoMes, Modalidad, Agenda, EstadoAsistencia)
        // preservando el 100% exacto de los totales y los Top 45 globales por mes/modalidad
        const compactRankingSet = (rows, entityKey, fallbackLabel) => {
            if (!Array.isArray(rows) || rows.length === 0) return [];
            // 1. Identificar top entidades por (PeriodoMes, Modalidad) para no perder nunca a ningún profesional/OS relevante
            const modTotals = new Map();
            for (const r of rows) {
                const mKey = `${r.PeriodoMes}|${r.Modalidad}`;
                const name = r[entityKey] || fallbackLabel;
                if (!modTotals.has(mKey)) modTotals.set(mKey, new Map());
                const inner = modTotals.get(mKey);
                inner.set(name, (inner.get(name) || 0) + (r.Cantidad || 0));
            }
            const topPerMod = new Map();
            for (const [mKey, inner] of modTotals.entries()) {
                const sorted = Array.from(inner.entries())
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 45)
                    .map(e => e[0]);
                topPerMod.set(mKey, new Set(sorted));
            }

            // 2. Agrupar respetando las entidades top o con Cantidad >= 5 en la agenda, y consolidando la cola menor en "OTROS"
            // para mantener el 100% exacto de la suma nominal y reducir el peso JSON en >85%
            const out = [];
            const tailBuckets = new Map();

            for (const r of rows) {
                const mKey = `${r.PeriodoMes}|${r.Modalidad}`;
                const name = r[entityKey] || fallbackLabel;
                const isTop = topPerMod.get(mKey)?.has(name);
                if (isTop || (r.Cantidad || 0) >= 5) {
                    out.push(r);
                } else {
                    const bKey = `${r.PeriodoMes}|${r.Modalidad}|${r.Agenda || 'SIN AGENDA'}|${r.EstadoAsistencia || ''}`;
                    if (!tailBuckets.has(bKey)) {
                        const baseObj = {
                            PeriodoMes: r.PeriodoMes,
                            Modalidad: r.Modalidad,
                            Agenda: r.Agenda,
                            [entityKey]: fallbackLabel,
                            Cantidad: 0
                        };
                        if (r.EstadoAsistencia !== undefined) baseObj.EstadoAsistencia = r.EstadoAsistencia;
                        tailBuckets.set(bKey, baseObj);
                    }
                    tailBuckets.get(bKey).Cantidad += (r.Cantidad || 0);
                }
            }

            for (const b of tailBuckets.values()) {
                if (b.Cantidad > 0) out.push(b);
            }
            return out;
        };

        const payload = {
            rango: { fechaDesde: desde, fechaHasta: hasta },
            elapsedMs: elapsed,
            agendas: res.recordsets[0] || [],
            realizadores: compactRankingSet(res.recordsets[1] || [], 'PrestadorRealiza', 'OTROS PROFESIONALES (MENOR VOLUMEN)'),
            solicitantes: compactRankingSet(res.recordsets[2] || [], 'PrestadorSolicita', 'OTROS SOLICITANTES (MENOR VOLUMEN)'),
            informantes: compactRankingSet(res.recordsets[3] || [], 'PrestadorInforma', 'OTROS INFORMANTES (MENOR VOLUMEN)'),
            obrasSociales: compactRankingSet(res.recordsets[4] || [], 'ObraSocial', 'OTRAS OBRAS SOCIALES (MENOR VOLUMEN)'),
            evolucion: res.recordsets[5] || [],
            asistencias: res.recordsets[6] || [],
            ultima_actualizacion: new Date().toISOString()
        };

        // Cachear en Supabase app_config (Resumen Fijo Precalculado de Carga Instantánea)
        try {
            await supabase.from('app_config').upsert({
                key: 'dxi_analytics_cache',
                value: payload,
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

/**
 * Obtiene el listado nominal de casos individuales de Diagnóstico por Imágenes (DxI) bajo demanda
 * cuando el usuario desea auditar cada caso/paciente en particular (Capa 2 - Drill-Down Nominal).
 */
export async function getDxICasosNominales({
    fechaDesde,
    fechaHasta,
    modalidad = 'TODAS',
    agenda = 'TODAS',
    ambito = 'TODOS',
    estadoAsistencia = 'TODOS',
    realizador = '',
    solicitante = '',
    obraSocial = '',
    search = '',
    limit = 400,
    saveDefaultCache = false
} = {}) {
    const pool = await sql.connect(SQL_CONFIG);
    try {
        let hasta = (fechaHasta || '').toString().trim() || new Date().toISOString().substring(0, 10);
        let desde = (fechaDesde || '').toString().trim() || '2026-10-01';
        const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 400, 50), 2000);

        const req = pool.request()
            .input('desde', sql.VarChar, `${desde} 00:00:00`)
            .input('hasta', sql.VarChar, `${hasta} 23:59:59`)
            .input('modalidad', sql.VarChar, modalidad || 'TODAS')
            .input('agenda', sql.VarChar, agenda || 'TODAS')
            .input('ambito', sql.VarChar, ambito || 'TODOS')
            .input('estadoAsistencia', sql.VarChar, estadoAsistencia || 'TODOS')
            .input('realizador', sql.VarChar, realizador ? `%${realizador}%` : '')
            .input('solicitante', sql.VarChar, solicitante ? `%${solicitante}%` : '')
            .input('obraSocial', sql.VarChar, obraSocial ? `%${obraSocial}%` : '')
            .input('search', sql.VarChar, search ? `%${search}%` : '');

        const query = `
            SELECT 
                idVisita,
                MAX(IdPeticionDePrueba) AS id_peticion,
                MAX(CASE WHEN [Fecha Informado] IS NOT NULL OR [Fecha Firma] IS NOT NULL THEN 1 ELSE 0 END) AS EstaInformado,
                MAX(CONVERT(VARCHAR(16), COALESCE([Fecha Informado], [Fecha Firma]), 120)) AS FechaInformadoStr,
                MAX(NULLIF(RTRIM(LTRIM(Solicitante)), '')) AS SolicitanteLIS,
                MAX(NULLIF(RTRIM(LTRIM(Prueba)), '')) AS PruebaLIS,
                MAX(NULLIF(RTRIM(LTRIM(HOSP_Habitacion)), '')) AS HabitacionLIS
            INTO #InformesCasos
            FROM [SALUS].[dbo].[VLIS_PeticionesPruebas_ARGENTINA] WITH (NOLOCK)
            WHERE [Fecha Solicitud] >= DATEADD(day, -45, CAST(@desde AS DATETIME))
              AND [Fecha Solicitud] <= DATEADD(day, 15, CAST(@hasta AS DATETIME))
              AND idVisita IS NOT NULL
              AND ISNULL(Prueba, '') NOT LIKE '%*** PETICION RADIOLOGÍA%'
              AND ISNULL(Prueba, '') NOT LIKE '%CONTRASTE%'
              AND ISNULL(Prueba, '') NOT LIKE '%AGUJA%'
            GROUP BY idVisita;

            CREATE CLUSTERED INDEX IX_InfCasos ON #InformesCasos(idVisita);

            WITH BaseCasos AS (
                SELECT 
                    ISNULL(i.id_peticion, v.idVisita) AS id_peticion,
                    v.idVisita AS id_visita,
                    CONVERT(VARCHAR(10), v.[Fecha Visita], 120) AS fecha_solicitud,
                    ISNULL(LEFT(v.[Hora Inicio Visita Formato Texto], 5), '00:00') AS hora_solicitud,
                    ISNULL(v.Paciente, 'SIN NOMBRE') AS paciente,
                    ISNULL(v.NHC, '') AS nhc,
                    ISNULL(v.NIF, '') AS dni,
                    v.Edad AS edad,
                    ISNULL(v.Sexo, '') AS sexo,
                    CASE 
                        WHEN v.[Grupo Agenda] = 'ECOCARDIO' THEN 'ECOCARDIO'
                        WHEN v.[Grupo Agenda] = 'ECOGRAFIAS' AND (ISNULL(v.[Tipo Visita], '') LIKE '(ECO)%' OR ISNULL(v.[Tipo Visita], '') LIKE '%ECOGRAF%' OR ISNULL(v.[Tipo Visita], '') LIKE '%DOPPLER%') THEN 'ECOGRAFIA'
                        WHEN v.[Grupo Agenda] = 'GUARDIAS ' AND (ISNULL(v.[Tipo Visita], '') LIKE '(ECO)%' OR ISNULL(v.[Tipo Visita], '') LIKE '%ECOGRAF%' OR ISNULL(v.[Tipo Visita], '') LIKE '%DOPPLER%') THEN 'ECOGRAFIA'
                        WHEN v.[Grupo Agenda] = 'TOMOGRAFIA' AND ISNULL(v.[Tipo Visita], '') LIKE '(TC)%' THEN 'TOMOGRAFIA'
                        WHEN v.[Grupo Agenda] = 'DENSITOMETRIA Y MAMOGRAFIA' AND ISNULL(v.[Tipo Visita], '') LIKE '%DENSITOMETR%' THEN 'DENSITOMETRIA'
                        WHEN v.[Grupo Agenda] IN ('MAMOGRAFIA', 'DENSITOMETRIA Y MAMOGRAFIA') AND ISNULL(v.[Tipo Visita], '') NOT LIKE '%DENSITOMETR%' AND ISNULL(v.[Tipo Visita], '') LIKE '(RX)%' THEN 'MAMOGRAFIA'
                        WHEN v.[Grupo Agenda] = 'RADIOLOGIA' THEN 'RADIOLOGIA'
                        ELSE 'OTRAS'
                    END AS modalidad,
                    ISNULL(v.[Tipo Visita], 'SIN AGENDA') AS agenda,
                    ISNULL(i.PruebaLIS, ISNULL(v.[Tipo Visita], 'SIN ESPECIFICAR')) AS estudio,
                    ISNULL(v.VIS_Centro, ISNULL(v.Centro, 'SAN LUIS SUR')) AS centro,
                    ISNULL(v.Responsable, 'SIN ASIGNAR / INSTITUCIONAL') AS realizador,
                    ISNULL(i.SolicitanteLIS, ISNULL(NULLIF(RTRIM(LTRIM(v.[Persona referidora])), ''), 'NO ESPECIFICADO / EXTERNO')) AS solicitante,
                    ISNULL(v.Cliente, 'PARTICULAR / SIN FINANCIADOR') AS obra_social,
                    ISNULL(NULLIF(RTRIM(LTRIM(v.Asistencia)), ''), 'SIN REGISTRAR') AS asistencia_original,
                    CASE 
                        WHEN v.Asistencia = 'Presente' THEN 'Presente'
                        WHEN v.Asistencia = 'INTERNADO' THEN 'Internado'
                        WHEN v.Asistencia = 'URGENCIA' THEN 'Urgencia'
                        WHEN v.Asistencia = 'SOBRETURNO' THEN 'Sobreturno'
                        WHEN v.Asistencia IN ('Ausencia justificada', 'Ausencia injustificada') THEN 'Ausente'
                        WHEN v.Asistencia LIKE '%SUSPENDIDA%' OR v.Asistencia LIKE '%Anulación%' OR v.Asistencia LIKE '%CANCEL%' THEN 'Cancelada'
                        WHEN v.Asistencia IS NULL OR RTRIM(LTRIM(v.Asistencia)) = '' THEN 'Sin Registrar'
                        ELSE v.Asistencia
                    END AS estado_asistencia,
                    CASE 
                        WHEN v.Asistencia IN ('Presente', 'URGENCIA', 'SOBRETURNO') THEN 'Ambulatorio'
                        WHEN v.Asistencia = 'INTERNADO' THEN 'Hospitalización'
                        WHEN v.Asistencia IN ('Ausencia justificada', 'Ausencia injustificada', 'SUSPENDIDA') THEN 'No Realizado'
                        ELSE 'Ambulatorio'
                    END AS ambito,
                    ISNULL(i.EstaInformado, 0) AS informado,
                    i.FechaInformadoStr AS fecha_informado,
                    ISNULL(i.HabitacionLIS, '') AS habitacion,
                    v.[Fecha Visita] AS raw_fecha
                FROM [SALUS].[dbo].[VLISE_Visitas] v WITH (NOLOCK)
                LEFT JOIN #InformesCasos i ON i.idVisita = v.idVisita
                WHERE v.[Fecha Visita] >= @desde AND v.[Fecha Visita] <= @hasta
                  AND (
                      v.[Grupo Agenda] IN ('ECOGRAFIAS', 'ECOCARDIO', 'TOMOGRAFIA', 'MAMOGRAFIA', 'DENSITOMETRIA Y MAMOGRAFIA', 'RADIOLOGIA')
                      OR (v.[Grupo Agenda] = 'GUARDIAS ' AND (v.[Tipo Visita] LIKE '(ECO)%' OR v.[Tipo Visita] LIKE '%ECOGRAF%' OR v.[Tipo Visita] LIKE '%DOPPLER%'))
                  )
                  AND ISNULL(v.[Tipo Visita], '') NOT LIKE '%MEDIO DE CONTRASTE%'
                  AND ISNULL(v.[Tipo Visita], '') NOT LIKE '%ADICIONAL POR%ANESTESIA%'
                  AND ISNULL(v.[Tipo Visita], '') NOT LIKE '%MEDICI%N DE ESCOLIOSIS%'
                  AND ISNULL(v.[Tipo Visita], '') NOT LIKE '%MEDICI%N DE MIEMBROS INFERIORES%'
            )
            SELECT TOP (${safeLimit}) *
            FROM BaseCasos
            WHERE modalidad <> 'OTRAS'
              AND (@modalidad = 'TODAS' OR modalidad = @modalidad)
              AND (@agenda = 'TODAS' OR agenda = @agenda)
              AND (@ambito = 'TODOS' OR ambito = @ambito)
              AND (@estadoAsistencia = 'TODOS' OR estado_asistencia = @estadoAsistencia)
              AND (@realizador = '' OR realizador LIKE @realizador)
              AND (@solicitante = '' OR solicitante LIKE @solicitante)
              AND (@obraSocial = '' OR obra_social LIKE @obraSocial)
              AND (
                  @search = '' 
                  OR paciente LIKE @search 
                  OR dni LIKE @search 
                  OR nhc LIKE @search 
                  OR estudio LIKE @search 
                  OR agenda LIKE @search
                  OR realizador LIKE @search
                  OR solicitante LIKE @search
                  OR obra_social LIKE @search
              )
            ORDER BY raw_fecha DESC;

            DROP TABLE #InformesCasos;
        `;

        const res = await req.query(query);
        const rows = res.recordset || [];

        if (saveDefaultCache && rows.length > 0) {
            try {
                await supabase.from('app_config').upsert({
                    key: 'dxi_casos_nominales_cache',
                    value: {
                        updated_at: new Date().toISOString(),
                        rango: { fechaDesde: desde, fechaHasta: hasta },
                        casos: rows.slice(0, 600)
                    },
                    label: 'Caché de Casos Nominales Recientes DxI',
                    category: 'gobernanza_dxi',
                    is_secret: false,
                    updated_at: new Date().toISOString(),
                    updated_by: 'sync_dxi.mjs'
                }, { onConflict: 'key' });
            } catch (e) {
                console.warn('[getDxICasosNominales] Error guardando caché nominal:', e.message);
            }
        }

        return rows;
    } finally {
        await pool.close();
    }
}
