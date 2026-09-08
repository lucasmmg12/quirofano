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
        requestTimeout: 180000,
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

async function syncUCIStudies() {
    console.log('[Sync UCI] Conectando a SALUS...');
    const pool = await sql.connect(SQL_CONFIG);
    console.log('[Sync UCI] Conectado.');

    // 1. Asegurar tabla y constraint
    await runSqlInSupabase(`
        CREATE TABLE IF NOT EXISTS calidad_peticiones_pruebas (
            id BIGSERIAL PRIMARY KEY,
            id_peticion VARCHAR(100) NOT NULL,
            fecha_solicitud TIMESTAMPTZ,
            id_paciente VARCHAR(50),
            paciente VARCHAR(250),
            solicitante VARCHAR(200),
            paciente_edad INT,
            origen VARCHAR(100),
            tipo_visita VARCHAR(100),
            tipo_articulo VARCHAR(100),
            estudio VARCHAR(255),
            habitacion VARCHAR(100),
            cama VARCHAR(50),
            prioridad VARCHAR(50),
            seccion VARCHAR(100),
            anio_solicitud INT,
            mes_solicitud INT,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            CONSTRAINT uq_peticion_estudio UNIQUE (id_peticion, estudio)
        );
    `);

    // 2. Extraer peticiones de UCI (Boxes y Cuidados Críticos)
    console.log('[Sync UCI] Extrayendo estudios de UCI y Boxes...');
    const uciQuery = `
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
          AND (
              p.HOSP_Habitacion LIKE '%Box%' 
              OR p.HOSP_Habitacion LIKE '%BOX%'
              OR p.HOSP_Habitacion LIKE '%UNIDAD%'
              OR p.HOSP_Habitacion LIKE '%UCI%'
              OR p.HOSP_Habitacion LIKE '%UTI%'
          )
    `;

    const result = await pool.request().query(uciQuery);
    const rows = result.recordset;
    console.log(`[Sync UCI] Registros de UCI obtenidos: ${rows.length}`);

    // Insertar en chunks de 400
    const CHUNK_SIZE = 400;
    let inserted = 0;

    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
        const chunk = rows.slice(i, i + CHUNK_SIZE);
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
        inserted += chunk.length;
        if (inserted % 2000 === 0 || inserted === rows.length) {
            console.log(`[Sync UCI] Insertados ${inserted} de ${rows.length}...`);
        }
    }

    console.log(`[Sync UCI] ¡Sincronización de UCI completada! Total: ${inserted}`);
    await pool.close();
}

syncUCIStudies().catch(console.error);
