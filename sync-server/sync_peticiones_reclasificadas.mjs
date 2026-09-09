import sql from 'mssql';

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
        requestTimeout: 240000,
        connectionTimeout: 20000,
        tdsVersion: '7_4',
    },
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

async function syncReclasificacion() {
    console.log('[Sync Reclasificación] Conectando a SALUS...');
    const pool = await sql.connect(SQL_CONFIG);
    console.log('[Sync Reclasificación] Conectado.');

    // 1. Obtener resumen de Gobernanza Reclasificada
    console.log('[Sync Reclasificación] Ejecutando agrupación de Gobernanza Reclasificada en SALUS...');
    const resGobernanza = await pool.request().query(`
        SELECT 
            CASE 
                WHEN Origen = 'Hospitalización' THEN 'Hospitalización Nominal'
                WHEN Origen = 'Ambulatorio' AND Asistencia = 'INTERNADO' THEN 'Internación (Vía Imágenes)'
                WHEN Origen = 'Ambulatorio' AND Asistencia = 'URGENCIA' THEN 'Guardia / Urgencias'
                WHEN Origen = 'Ambulatorio' AND [Tipo Articulo] = 'Petición Radiologia' AND Asistencia IS NULL THEN 'Internación Presunta (Sin Recepción)'
                ELSE 'Ambulatorio Efectivo'
            END AS OrigenGobernanza,
            COUNT(*) AS CantidadEstudios,
            CAST(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER() AS DECIMAL(10,2)) AS PorcentajeProduccion
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
        ORDER BY CantidadEstudios DESC
    `);

    console.log('[Sync Reclasificación] Resumen de Gobernanza obtenido:');
    console.table(resGobernanza.recordset);

    // Guardar en Supabase
    for (const row of resGobernanza.recordset) {
        const cat = (row.OrigenGobernanza || 'Desconocido').replace(/'/g, "''");
        const cant = row.CantidadEstudios || 0;
        const pct = row.PorcentajeProduccion || 0;

        await runSqlInSupabase(`
            INSERT INTO calidad_peticiones_resumen_gobernanza (origen_clasificacion, cantidad_estudios, porcentaje_produccion, updated_at)
            VALUES ('${cat}', ${cant}, ${pct}, NOW())
            ON CONFLICT (origen_clasificacion)
            DO UPDATE SET 
                cantidad_estudios = EXCLUDED.cantidad_estudios,
                porcentaje_produccion = EXCLUDED.porcentaje_produccion,
                updated_at = NOW();
        `);
    }
    console.log('[Sync Reclasificación] Resumen de Gobernanza guardado en Supabase.');

    // 2. Extraer Ecografías, Tomografías y Radiografías de Internación Reclasificada
    // (Pacientes con Asistencia = 'INTERNADO', Asistencia = 'URGENCIA' o Asistencia IS NULL en Radiología)
    console.log('[Sync Reclasificación] Extrayendo estudios de imágenes no ambulatorios...');
    const qImagenes = await pool.request().query(`
        SELECT TOP 8000
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
        WHERE p.[Fecha Solicitud] >= '2025-06-01'
          AND p.Origen = 'Ambulatorio'
          AND p.[Tipo Articulo] = 'Petición Radiologia'
          AND (p.Asistencia IN ('INTERNADO', 'URGENCIA') OR p.Asistencia IS NULL)
        ORDER BY p.[Fecha Solicitud] DESC
    `);

    console.log(`[Sync Reclasificación] Obtenidos ${qImagenes.recordset.length} estudios de imágenes reclasificados.`);

    // Insertar en chunks de 300
    const CHUNK_SIZE = 300;
    const rows = qImagenes.recordset;
    let inserted = 0;

    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
        const rawChunk = rows.slice(i, i + CHUNK_SIZE);
        
        // Desduplicar dentro del mismo lote para evitar error 21000 de Postgres
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
        inserted += chunk.length;
    }

    // 3. Actualizar modalidad = 'Laboratorio' y origen_gobernanza = 'Hospitalización' para los que ya estaban
    await runSqlInSupabase(`
        UPDATE calidad_peticiones_pruebas 
        SET modalidad = 'Laboratorio', origen_gobernanza = 'Hospitalización'
        WHERE modalidad IS NULL;
    `);

    console.log(`[Sync Reclasificación] Inserción finalizada: ${inserted} estudios reclasificados cargados.`);
    await pool.close();
}

syncReclasificacion().catch(console.error);
