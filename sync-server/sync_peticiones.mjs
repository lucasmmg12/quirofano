import sql from 'mssql';
import { createClient } from '@supabase/supabase-js';

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
        requestTimeout: 300000, // 5 min
        connectionTimeout: 20000,
        tdsVersion: '7_4',
    },
};

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://hakysnqiryimxbwdslwe.supabase.co';
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

async function syncPeticiones() {
    console.log('[Sync Peticiones] Iniciando conexión con SALUS...');
    const pool = await sql.connect(SQL_CONFIG);
    console.log('[Sync Peticiones] Conectado a SALUS.');

    // 1. QUERY 2: Resumen por Origen
    console.log('[Sync Peticiones] Ejecutando Query 2 (Producción por Origen)...');
    const resOrigen = await pool.request().query(`
        SELECT 
            Origen,
            COUNT(*) AS CantidadEstudios,
            CAST(
                COUNT(*) * 100.0 / SUM(COUNT(*)) OVER() 
            AS DECIMAL(10, 2)) AS PorcentajeProduccion
        FROM VLISE_PeticionesPruebas
        WHERE [Fecha Solicitud] >= '2025-06-01'
          AND [Fecha Solicitud] IS NOT NULL
        GROUP BY Origen
    `);

    console.log('[Sync Peticiones] Resumen de Origen obtenido:', resOrigen.recordset);
    
    // Guardar en Supabase
    for (const row of resOrigen.recordset) {
        const origenEscaped = (row.Origen || 'Desconocido').replace(/'/g, "''");
        const cantidad = row.CantidadEstudios || 0;
        const porcentaje = row.PorcentajeProduccion || 0;
        
        await runSqlInSupabase(`
            INSERT INTO calidad_peticiones_resumen_origen (origen, cantidad_estudios, porcentaje_produccion, updated_at)
            VALUES ('${origenEscaped}', ${cantidad}, ${porcentaje}, NOW())
            ON CONFLICT (origen) 
            DO UPDATE SET 
                cantidad_estudios = EXCLUDED.cantidad_estudios,
                porcentaje_produccion = EXCLUDED.porcentaje_produccion,
                updated_at = NOW();
        `);
    }
    console.log('[Sync Peticiones] Resumen de Origen actualizado en Supabase.');

    // 2. QUERY 1: Detalle de Peticiones y Estudios de UCI e Internación
    // Enriquecida con estudio (Descripcion1), habitacion (HOSP_Habitacion), cama y prioridad
    console.log('[Sync Peticiones] Obteniendo peticiones de Hospitalización / UCI desde 2025-06-01...');
    
    // Priorizamos registros de Hospitalización (que incluye Boxes de UCI, Terapia, etc.)
    // Tomamos por lotes o los más relevantes
    const queryHospitalizacion = `
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
            p.Descripcion1 AS Estudio,
            p.HOSP_Habitacion AS Habitacion,
            p.Cama,
            p.Prioridad,
            p.Articulo_Sección AS Seccion,
            YEAR(p.[Fecha Solicitud]) AS AnioSolicitud,
            MONTH(p.[Fecha Solicitud]) AS MesSolicitud
        FROM VLISE_PeticionesPruebas p
        WHERE p.[Fecha Solicitud] >= '2025-06-01'
          AND p.[Fecha Solicitud] IS NOT NULL
          AND p.Origen = 'Hospitalización'
        ORDER BY p.[Fecha Solicitud] DESC
    `;

    const request = new sql.Request(pool);
    request.stream = true;
    request.query(queryHospitalizacion);

    let batch = [];
    const BATCH_SIZE = 500;
    let totalSincronizados = 0;

    async function flushBatch(rows) {
        if (!rows.length) return;
        const values = rows.map(r => {
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
            const sec = r.Seccion ? `'${String(r.Seccion).replace(/'/g, "''")}'` : 'NULL';
            const anio = r.AnioSolicitud || 'NULL';
            const mes = r.MesSolicitud || 'NULL';

            return `(${idPeticion}, ${fecha}, ${idPac}, ${pac}, ${sol}, ${edad}, ${origen}, ${tipoVis}, ${tipoArt}, ${est}, ${hab}, ${cama}, ${prio}, ${sec}, ${anio}, ${mes})`;
        }).join(',\n');

        const insertSql = `
            INSERT INTO calidad_peticiones_pruebas (
                id_peticion, fecha_solicitud, id_paciente, paciente, solicitante, 
                paciente_edad, origen, tipo_visita, tipo_articulo, estudio, 
                habitacion, cama, prioridad, seccion, anio_solicitud, mes_solicitud
            ) VALUES 
            ${values}
            ON CONFLICT (id_peticion, estudio) DO NOTHING;
        `;

        await runSqlInSupabase(insertSql);
        totalSincronizados += rows.length;
        if (totalSincronizados % 2500 === 0) {
            console.log(`[Sync Peticiones] Sincronizados ${totalSincronizados} registros...`);
        }
    }

    return new Promise((resolve, reject) => {
        request.on('row', async (row) => {
            batch.push(row);
            if (batch.length >= BATCH_SIZE) {
                request.pause();
                const toInsert = [...batch];
                batch = [];
                try {
                    await flushBatch(toInsert);
                    request.resume();
                } catch (err) {
                    console.error('[Sync Peticiones] Error insertando lote:', err.message);
                    request.resume();
                }
            }
        });

        request.on('error', (err) => {
            console.error('[Sync Peticiones] Stream Error:', err);
            reject(err);
        });

        request.on('done', async () => {
            if (batch.length > 0) {
                try {
                    await flushBatch(batch);
                } catch (err) {
                    console.error('[Sync Peticiones] Error en lote final:', err.message);
                }
            }
            console.log(`[Sync Peticiones] FINALIZADO. Total procesados: ${totalSincronizados}`);
            await pool.close();
            resolve();
        });
    });
}

syncPeticiones().catch(console.error);
