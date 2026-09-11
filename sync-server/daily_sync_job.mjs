/**
 * daily_sync_job.mjs — Sincronizador Diario Unificado para Sanatorio Argentino
 * Sincroniza incrementalmente:
 *  1. Días Camas Ocupados (TABLEAU_Admisiones ↔ calidad_admisiones_ocupacion)
 *  2. Estudios y Analíticas Clínicas en UCI (VLISE_PeticionesPruebas ↔ calidad_peticiones_pruebas)
 *  3. Imágenes Reclasificadas de Internación/Guardia (VLISE_PeticionesPruebas ↔ calidad_peticiones_pruebas)
 *  4. Resúmenes de Producción y Gobernanza (calidad_peticiones_resumen_origen y resumen_gobernanza)
 * 
 * Programable en Windows Task Scheduler (ej: 06:00 AM diario)
 */

import sql from 'mssql';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '.env') });

import { syncHistorialCamas } from './sync_ocupacion.mjs';
import { syncDiagnosticos } from './sync_diagnosticos.mjs';
import { syncKinesiologiaUci } from './sync_kinesiologia_uci.mjs';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://hakysnqiryimxbwdslwe.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const SQL_CONFIG = {
    server: process.env.SALUS_DB_SERVER || '128.223.16.29',
    port: Number(process.env.SALUS_DB_PORT) || 2450,
    user: process.env.SALUS_DB_USER || 'SalusConsulta',
    password: process.env.SALUS_DB_PASSWORD || 'ConsultaSALUS1234',
    database: process.env.SALUS_DB_NAME || 'SALUS',
    options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true,
        requestTimeout: 240000,
        connectionTimeout: 20000,
        tdsVersion: '7_4',
    },
    pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
};

const token = process.env.SUPABASE_ACCESS_TOKEN || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ref = process.env.SUPABASE_PROJECT_REF || 'hakysnqiryimxbwdslwe';

async function runSqlInSupabase(queryText) {
    const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: queryText })
    });
    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Supabase SQL Error (${res.status}): ${txt}`);
    }
    return await res.json();
}

function log(msg) {
    const ts = new Date().toISOString().replace('T', ' ').substring(0, 19);
    console.log(`[${ts}] [DAILY-SYNC] ${msg}`);
}

async function runDailySync() {
    const t0 = Date.now();
    log('========================================================');
    log('🚀 Iniciando Job Diario de Sincronización SALUS ↔ Supabase');
    log('========================================================');

    log('Conectando al servidor SQL Server de SALUS...');
    const pool = await sql.connect(SQL_CONFIG);
    log('Conexión establecida con éxito a SALUS.');

    // ──────────────────────────────────────────────────────────
    // PASO 1: Sincronización Incremental de Ocupación de Camas
    // ──────────────────────────────────────────────────────────
    log('PASO 1/4: Sincronizando Días Camas Ocupados (últimos 45 días)...');
    const qOcupacion = await pool.request().query(`
        SELECT 
            b.[Número admisión] AS numero_admision,
            DATEADD(DAY, v.number, CAST(b.[Fecha ingreso] AS DATE)) AS fecha_ocupacion,
            b.[Habitación] AS habitacion,
            b.Especialidad AS especialidad,
            b.idAdmision AS id_admision,
            b.[Fecha ingreso] AS fecha_ingreso,
            b.[Fecha alta] AS fecha_alta,
            b.Procedencia AS procedencia,
            b.NHC AS nhc,
            b.Paciente AS paciente,
            b.[Motivo de alta] AS motivo_de_alta,
            b.Cliente AS cliente,
            b.[Estado Conceptos] AS estado_conceptos,
            b.Servicio AS servicio,
            b.Proceso AS proceso,
            b.Edad AS edad,
            b.[Motivo Alta] AS motivo_alta,
            b.[Control ADM finalizado] AS control_adm_finalizado
        FROM TABLEAU_Admisiones b
        JOIN master.dbo.spt_values v
          ON v.type = 'P' 
          AND v.number <= DATEDIFF(DAY, CAST(b.[Fecha ingreso] AS DATE), CAST(ISNULL(b.[Fecha alta], GETDATE()) AS DATE))
        WHERE (b.[Fecha alta] >= DATEADD(DAY, -45, GETDATE()) OR b.[Fecha alta] IS NULL)
          AND b.[Fecha ingreso] >= '2025-06-01'
    `);

    log(`Obtenidos ${qOcupacion.recordset.length} registros de ocupación activa.`);
    
    // Inserción en lotes de 800 mediante supabase client
    const BATCH_SIZE = 800;
    const records = qOcupacion.recordset;
    let syncedOcup = 0;

    const dataToUpsert = records.map(r => ({
        id_admision: r.id_admision,
        numero_admision: r.numero_admision ? String(r.numero_admision).trim() : null,
        fecha_ocupacion: r.fecha_ocupacion ? new Date(r.fecha_ocupacion).toISOString().split('T')[0] : null,
        habitacion: r.habitacion ? String(r.habitacion).trim() : null,
        fecha_ingreso: r.fecha_ingreso ? new Date(r.fecha_ingreso).toISOString() : null,
        fecha_alta: r.fecha_alta ? new Date(r.fecha_alta).toISOString() : null,
        especialidad: r.especialidad ? String(r.especialidad).trim() : 'Sin Especialidad',
        procedencia: r.procedencia ? String(r.procedencia).trim() : null,
        nhc: r.nhc ? String(r.nhc).trim() : null,
        paciente: r.paciente ? String(r.paciente).trim() : null,
        motivo_de_alta: r.motivo_de_alta ? String(r.motivo_de_alta).trim() : null,
        cliente: r.cliente ? String(r.cliente).trim() : null,
        estado_conceptos: r.estado_conceptos ? String(r.estado_conceptos).trim() : null,
        servicio: r.servicio ? String(r.servicio).trim() : 'Sin Servicio',
        proceso: r.proceso ? String(r.proceso).trim() : null,
        edad: typeof r.edad === 'number' ? r.edad : parseInt(r.edad, 10) || null,
        motivo_alta_2: r.motivo_alta ? String(r.motivo_alta).trim() : null,
        control_adm_finalizado: r.control_adm_finalizado ? String(r.control_adm_finalizado).trim() : null,
        updated_at: new Date().toISOString()
    })).filter(r => r.id_admision && r.fecha_ocupacion);

    for (let i = 0; i < dataToUpsert.length; i += BATCH_SIZE) {
        const rawBatch = dataToUpsert.slice(i, i + BATCH_SIZE);
        // Desduplicar dentro del lote
        const seen = new Set();
        const batch = rawBatch.filter(item => {
            const key = `${item.id_admision}|${item.fecha_ocupacion}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        const { error } = await supabase
            .from('calidad_admisiones_ocupacion')
            .upsert(batch, { onConflict: 'id_admision,fecha_ocupacion' });

        if (error) {
            log(`⚠️ Error en lote de ocupación (${i / BATCH_SIZE + 1}): ${error.message}`);
        } else {
            syncedOcup += batch.length;
        }
    }
    log(`Paso 1 completado: ${syncedOcup} días camas actualizados/insertados.`);

    // ──────────────────────────────────────────────────────────
    // PASO 1.5: Sincronización de Historial Granular de Camas y Traslados
    // ──────────────────────────────────────────────────────────
    try {
        log('PASO 1.5: Sincronizando Historial de Traslados de Cama (calidad_admisiones_camas_historial)...');
        await syncHistorialCamas('UCI');
        log('Paso 1.5 completado.');
    } catch (errHist) {
        log(`⚠️ Advertencia en Paso 1.5 (Historial Camas): ${errHist.message}`);
    }

    // ──────────────────────────────────────────────────────────
    // PASO 2: Sincronización de Estudios de Laboratorio en UCI
    // ──────────────────────────────────────────────────────────
    log('PASO 2/4: Sincronizando Estudios de Laboratorio en UCI / Críticos (últimos 30 días)...');
    const qLab = await pool.request().query(`
        SELECT 
            CAST(p.IdPeticionDePrueba AS VARCHAR(50)) AS IdPeticion,
            p.[Fecha Solicitud] AS FechaSolicitud,
            CAST(p.IdPaciente AS VARCHAR(50)) AS IdPaciente,
            p.Paciente,
            p.Solicitante,
            CAST(p.[Paciente Edad] AS INT) AS PacienteEdad,
            p.Origen,
            p.[Tipo Visita] AS TipoVisita,
            p.[Tipo Articulo] AS TipoArticulo,
            ISNULL(p.Prueba, p.Descripcion1) AS Estudio,
            p.HOSP_Habitacion AS Habitacion,
            p.Cama,
            p.Prioridad,
            p.Asistencia,
            YEAR(p.[Fecha Solicitud]) AS AnioSolicitud,
            MONTH(p.[Fecha Solicitud]) AS MesSolicitud
        FROM VLISE_PeticionesPruebas p
        WHERE p.[Fecha Solicitud] >= DATEADD(DAY, -30, GETDATE())
          AND (p.HOSP_Habitacion LIKE '%BOX%' OR p.HOSP_Habitacion LIKE '%UNIDAD%')
    `);

    log(`Obtenidos ${qLab.recordset.length} estudios de laboratorio en Boxes UCI.`);
    let syncedLab = 0;
    const rowsLab = qLab.recordset;
    const CHUNK_SIZE = 400;

    for (let i = 0; i < rowsLab.length; i += CHUNK_SIZE) {
        const rawChunk = rowsLab.slice(i, i + CHUNK_SIZE);
        const seenInBatch = new Set();
        const chunk = rawChunk.filter(r => {
            const key = `${r.IdPeticion || ''}|${r.Estudio || ''}`;
            if (seenInBatch.has(key)) return false;
            seenInBatch.add(key);
            return true;
        });

        const values = chunk.map(r => {
            const idPeticion = `'${(r.IdPeticion || '').replace(/'/g, "''")}'`;
            const fecha = r.FechaSolicitud ? `'${new Date(r.FechaSolicitud).toISOString()}'` : 'NULL';
            const idPac = r.IdPaciente ? `'${String(r.IdPaciente).replace(/'/g, "''")}'` : 'NULL';
            const pac = r.Paciente ? `'${String(r.Paciente).replace(/'/g, "''")}'` : 'NULL';
            const sol = r.Solicitante ? `'${String(r.Solicitante).replace(/'/g, "''")}'` : 'NULL';
            const edad = r.PacienteEdad !== null && !isNaN(r.PacienteEdad) ? Number(r.PacienteEdad) : 'NULL';
            const origen = r.Origen ? `'${String(r.Origen).replace(/'/g, "''")}'` : 'NULL';
            const tipoVis = r.TipoVisita ? `'${String(r.TipoVisita).replace(/'/g, "''")}'` : 'NULL';
            const tipoArt = r.TipoArticulo ? `'${String(r.TipoArticulo).replace(/'/g, "''")}'` : 'NULL';
            const est = r.Estudio ? `'${String(r.Estudio).replace(/'/g, "''")}'` : `'SIN DETALLE'`;
            const hab = r.Habitacion ? `'${String(r.Habitacion).replace(/'/g, "''")}'` : 'NULL';
            const cama = r.Cama ? `'${String(r.Cama).replace(/'/g, "''")}'` : 'NULL';
            const prio = r.Prioridad ? `'${String(r.Prioridad).replace(/'/g, "''")}'` : 'NULL';
            const asis = r.Asistencia ? `'${String(r.Asistencia).replace(/'/g, "''")}'` : 'NULL';
            const mod = `'Laboratorio'`;
            const origGob = `'Hospitalización'`;
            const anio = r.AnioSolicitud || 'NULL';
            const mes = r.MesSolicitud || 'NULL';

            return `(${idPeticion}, ${fecha}, ${idPac}, ${pac}, ${sol}, ${edad}, ${origen}, ${tipoVis}, ${tipoArt}, ${est}, ${hab}, ${cama}, ${prio}, ${asis}, ${mod}, ${origGob}, ${anio}, ${mes})`;
        }).join(',\n');

        if (values.length > 0) {
            const insertSql = `
                INSERT INTO calidad_peticiones_pruebas (
                    id_peticion, fecha_solicitud, id_paciente, paciente, solicitante, 
                    paciente_edad, origen, tipo_visita, tipo_articulo, estudio, 
                    habitacion, cama, prioridad, asistencia, modalidad, origen_gobernanza,
                    anio_solicitud, mes_solicitud
                ) VALUES 
                ${values}
                ON CONFLICT (id_peticion, estudio) DO NOTHING;
            `;
            await runSqlInSupabase(insertSql);
            syncedLab += chunk.length;
        }
    }
    log(`Paso 2 completado: ${syncedLab} estudios de laboratorio sincronizados.`);

    // ──────────────────────────────────────────────────────────
    // PASO 3: Sincronización de Imágenes Reclasificadas
    // ──────────────────────────────────────────────────────────
    log('PASO 3/4: Sincronizando Imágenes Reclasificadas (últimos 30 días)...');
    const qImg = await pool.request().query(`
        SELECT 
            CAST(p.IdPeticionDePrueba AS VARCHAR(50)) AS IdPeticion,
            p.[Fecha Solicitud] AS FechaSolicitud,
            CAST(p.IdPaciente AS VARCHAR(50)) AS IdPaciente,
            p.Paciente,
            p.Solicitante,
            CAST(p.[Paciente Edad] AS INT) AS PacienteEdad,
            p.Origen,
            p.[Tipo Visita] AS TipoVisita,
            p.[Tipo Articulo] AS TipoArticulo,
            ISNULL(p.Prueba, p.Descripcion1) AS Estudio,
            p.HOSP_Habitacion AS Habitacion,
            p.Cama,
            p.Prioridad,
            p.Asistencia,
            'Imágenes' AS Modalidad,
            CASE 
                WHEN p.Asistencia = 'INTERNADO' THEN 'Internación (Vía Imágenes)'
                WHEN p.Asistencia = 'URGENCIA' THEN 'Guardia / Urgencias'
                ELSE 'Internación Presunta (Sin Recepción)'
            END AS OrigenGobernanza,
            YEAR(p.[Fecha Solicitud]) AS AnioSolicitud,
            MONTH(p.[Fecha Solicitud]) AS MesSolicitud
        FROM VLISE_PeticionesPruebas p
        WHERE p.[Fecha Solicitud] >= DATEADD(DAY, -30, GETDATE())
          AND p.Origen = 'Ambulatorio'
          AND p.[Tipo Articulo] = 'Petición Radiologia'
          AND (p.Asistencia IN ('INTERNADO', 'URGENCIA') OR p.Asistencia IS NULL)
    `);

    log(`Obtenidos ${qImg.recordset.length} estudios de imágenes reclasificados.`);
    let syncedImg = 0;
    const rowsImg = qImg.recordset;

    for (let i = 0; i < rowsImg.length; i += CHUNK_SIZE) {
        const rawChunk = rowsImg.slice(i, i + CHUNK_SIZE);
        const seenInBatch = new Set();
        const chunk = rawChunk.filter(r => {
            const key = `${r.IdPeticion || ''}|${r.Estudio || ''}`;
            if (seenInBatch.has(key)) return false;
            seenInBatch.add(key);
            return true;
        });

        const values = chunk.map(r => {
            const idPeticion = `'${(r.IdPeticion || '').replace(/'/g, "''")}'`;
            const fecha = r.FechaSolicitud ? `'${new Date(r.FechaSolicitud).toISOString()}'` : 'NULL';
            const idPac = r.IdPaciente ? `'${String(r.IdPaciente).replace(/'/g, "''")}'` : 'NULL';
            const pac = r.Paciente ? `'${String(r.Paciente).replace(/'/g, "''")}'` : 'NULL';
            const sol = r.Solicitante ? `'${String(r.Solicitante).replace(/'/g, "''")}'` : 'NULL';
            const edad = r.PacienteEdad !== null && !isNaN(r.PacienteEdad) ? Number(r.PacienteEdad) : 'NULL';
            const origen = r.Origen ? `'${String(r.Origen).replace(/'/g, "''")}'` : 'NULL';
            const tipoVis = r.TipoVisita ? `'${String(r.TipoVisita).replace(/'/g, "''")}'` : 'NULL';
            const tipoArt = r.TipoArticulo ? `'${String(r.TipoArticulo).replace(/'/g, "''")}'` : 'NULL';
            const est = r.Estudio ? `'${String(r.Estudio).replace(/'/g, "''")}'` : `'SIN DETALLE'`;
            const hab = r.Habitacion ? `'${String(r.Habitacion).replace(/'/g, "''")}'` : 'NULL';
            const cama = r.Cama ? `'${String(r.Cama).replace(/'/g, "''")}'` : 'NULL';
            const prio = r.Prioridad ? `'${String(r.Prioridad).replace(/'/g, "''")}'` : 'NULL';
            const asis = r.Asistencia ? `'${String(r.Asistencia).replace(/'/g, "''")}'` : 'NULL';
            const mod = `'Imágenes'`;
            const origGob = `'${(r.OrigenGobernanza || 'Internación').replace(/'/g, "''")}'`;
            const anio = r.AnioSolicitud || 'NULL';
            const mes = r.MesSolicitud || 'NULL';

            return `(${idPeticion}, ${fecha}, ${idPac}, ${pac}, ${sol}, ${edad}, ${origen}, ${tipoVis}, ${tipoArt}, ${est}, ${hab}, ${cama}, ${prio}, ${asis}, ${mod}, ${origGob}, ${anio}, ${mes})`;
        }).join(',\n');

        if (values.length > 0) {
            const insertSql = `
                INSERT INTO calidad_peticiones_pruebas (
                    id_peticion, fecha_solicitud, id_paciente, paciente, solicitante, 
                    paciente_edad, origen, tipo_visita, tipo_articulo, estudio, 
                    habitacion, cama, prioridad, asistencia, modalidad, origen_gobernanza,
                    anio_solicitud, mes_solicitud
                ) VALUES 
                ${values}
                ON CONFLICT (id_peticion, estudio) DO NOTHING;
            `;
            await runSqlInSupabase(insertSql);
            syncedImg += chunk.length;
        }
    }
    log(`Paso 3 completado: ${syncedImg} estudios de imágenes reclasificados sincronizados.`);

    // ──────────────────────────────────────────────────────────
    // PASO 4: Actualización de Resúmenes Institucionales
    // ──────────────────────────────────────────────────────────
    log('PASO 4/4: Actualizando Resúmenes de Producción y Gobernanza Reclasificada...');

    // Resumen Nominal (Query 2)
    const resNominal = await pool.request().query(`
        SELECT 
            Origen,
            COUNT(*) AS CantidadEstudios,
            CAST(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER() AS DECIMAL(10, 2)) AS PorcentajeProduccion
        FROM VLISE_PeticionesPruebas
        WHERE [Fecha Solicitud] >= '2025-06-01'
          AND [Fecha Solicitud] IS NOT NULL
        GROUP BY Origen
    `);

    for (const row of resNominal.recordset) {
        const orig = (row.Origen || 'Desconocido').replace(/'/g, "''");
        const cant = row.CantidadEstudios || 0;
        const pct = row.PorcentajeProduccion || 0;
        await runSqlInSupabase(`
            INSERT INTO calidad_peticiones_resumen_origen (origen, cantidad_estudios, porcentaje_produccion, updated_at)
            VALUES ('${orig}', ${cant}, ${pct}, NOW())
            ON CONFLICT (origen)
            DO UPDATE SET 
                cantidad_estudios = EXCLUDED.cantidad_estudios,
                porcentaje_produccion = EXCLUDED.porcentaje_produccion,
                updated_at = NOW();
        `);
    }

    // Resumen Gobernanza Reclasificada
    const resGob = await pool.request().query(`
        SELECT 
            CASE 
                WHEN Origen = 'Hospitalización' THEN 'Hospitalización Nominal'
                WHEN Origen = 'Ambulatorio' AND Asistencia = 'INTERNADO' THEN 'Internación (Vía Imágenes)'
                WHEN Origen = 'Ambulatorio' AND Asistencia = 'URGENCIA' THEN 'Guardia / Urgencias'
                WHEN Origen = 'Ambulatorio' AND [Tipo Articulo] = 'Petición Radiologia' AND Asistencia IS NULL THEN 'Internación Presunta (Sin Recepción)'
                ELSE 'Ambulatorio Efectivo'
            END AS OrigenGobernanza,
            COUNT(*) AS CantidadEstudios,
            CAST(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER() AS DECIMAL(10, 2)) AS PorcentajeProduccion
        FROM VLISE_PeticionesPruebas
        WHERE [Fecha Solicitud] >= '2025-06-01'
          AND [Fecha Solicitud] IS NOT NULL
        GROUP BY 
            CASE 
                WHEN Origen = 'Hospitalización' THEN 'Hospitalización Nominal'
                WHEN Origen = 'Ambulatorio' AND Asistencia = 'INTERNADO' THEN 'Internación (Vía Imágenes)'
                WHEN Origen = 'Ambulatorio' AND Asistencia = 'URGENCIA' THEN 'Guardia / Urgencias'
                WHEN Origen = 'Ambulatorio' AND [Tipo Articulo] = 'Petición Radiologia' AND Asistencia IS NULL THEN 'Internación Presunta (Sin Recepción)'
                ELSE 'Ambulatorio Efectivo'
            END
    `);

    for (const row of resGob.recordset) {
        const orig = (row.OrigenGobernanza || 'Desconocido').replace(/'/g, "''");
        const cant = row.CantidadEstudios || 0;
        const pct = row.PorcentajeProduccion || 0;
        await runSqlInSupabase(`
            INSERT INTO calidad_peticiones_resumen_gobernanza (origen_clasificacion, cantidad_estudios, porcentaje_produccion, updated_at)
            VALUES ('${orig}', ${cant}, ${pct}, NOW())
            ON CONFLICT (origen_clasificacion)
            DO UPDATE SET 
                cantidad_estudios = EXCLUDED.cantidad_estudios,
                porcentaje_produccion = EXCLUDED.porcentaje_produccion,
                updated_at = NOW();
        `);
    }

    await pool.close();

    // ──────────────────────────────────────────────────────────
    // PASO 5: Diagnósticos y Motivos de Consulta (Últimos 45 días)
    // ──────────────────────────────────────────────────────────
    log('PASO 5/5: Sincronizando Diagnósticos Clínicos y Motivos de Consulta (últimos 45 días)...');
    let syncedDiag = 0;
    try {
        const f45Diag = new Date(Date.now() - 45 * 24 * 3600 * 1000).toISOString().split('T')[0];
        const diagRes = await syncDiagnosticos(f45Diag);
        syncedDiag = diagRes.upserted || 0;
        log(`Paso 5 completado: ${syncedDiag} diagnósticos actualizados.`);
    } catch (eDiag) {
    // ──────────────────────────────────────────────────────────
    // PASO 6: Kinesiología y Terapia Respiratoria en UCI (Últimos 45 días)
    // ──────────────────────────────────────────────────────────
    log('PASO 6/6: Sincronizando Kinesiología y Terapia Respiratoria UCI (últimos 45 días)...');
    let syncedKine = 0;
    try {
        const f45Kine = new Date(Date.now() - 45 * 24 * 3600 * 1000).toISOString().split('T')[0];
        const kineRes = await syncKinesiologiaUci(f45Kine);
        syncedKine = kineRes.upserted || 0;
        log(`Paso 6 completado: ${syncedKine} registros de Kinesiología/ARM actualizados.`);
    } catch (eKine) {
        log(`⚠️ Error no bloqueante en Paso 6 (Kinesiología UCI): ${eKine.message}`);
    }

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    log('========================================================');
    log(`✅ Sincronización Diaria completada con éxito en ${elapsed}s.`);
    log(`📊 Resumen: ${syncedOcup} ocupaciones, ${syncedLab} lab UCI, ${syncedImg} imágenes, ${syncedDiag} diagnósticos, ${syncedKine} kinesiología/ARM.`);
    log('========================================================');
}

runDailySync().catch(err => {
    console.error('❌ Error crítico en daily_sync_job:', err);
    process.exit(1);
});
