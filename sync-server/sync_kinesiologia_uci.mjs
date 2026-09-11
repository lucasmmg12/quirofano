/**
 * sync_kinesiologia_uci.mjs
 * Sincronizador de Registros de Kinesiología y Terapia Respiratoria en UCI
 * Fuente: SALUS SQL Server -> [PR InstRespVisitaPaciente]
 * Destino: Supabase -> calidad_uci_kinesiologia
 */

import sql from 'mssql';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

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
        requestTimeout: 120000,
        connectionTimeout: 20000,
        tdsVersion: '7_4',
    },
    pool: { max: 5, min: 0, idleTimeoutMillis: 30000 }
};

function log(msg) {
    const ts = new Date().toISOString().replace('T', ' ').substring(0, 19);
    console.log(`[${ts}] [SYNC-KINE-UCI] ${msg}`);
}

export async function syncKinesiologiaUci(fromDate = '2026-06-01') {
    log(`🫁 Iniciando sincronización de Kinesiología UCI desde SALUS (desde: ${fromDate})...`);
    let pool;
    try {
        pool = await sql.connect(SQL_CONFIG);
        log('Conectado a SALUS SQL Server.');

        const req = pool.request();
        req.input('fromDate', sql.DateTime, new Date(fromDate));

        const query = `
            SELECT 
                r.id as id_registro_salus,
                COALESCE(v.NHC, CAST(r.idPaciente AS NVARCHAR(50))) as nhc,
                COALESCE(v.Paciente, 'PACIENTE NO NOMBRADO') as paciente,
                r.idPaciente as id_paciente_salus,
                r.idVisita as id_visita,
                v.idHospitalizacion as id_hospitalizacion,
                r.fecha as fecha_hora,
                pr.id as protocolo_id,
                pr.Descripcion as protocolo_nombre,
                g.Descripcion as grupo_nombre,
                pq.Descripcion as parametro,
                r.valorN as valor_numerico,
                r.valorM as valor_texto,
                rt.Descripcion as valor_combo,
                pq.Unidades as unidades,
                v.Responsable as profesional
            FROM [PR InstRespVisitaPaciente] r
            JOIN [PR PreguntasProtocolo] pp ON r.idPreguntaPr = pp.id
            JOIN [PR Preguntas] pq ON pp.idPregunta = pq.id
            JOIN [PR GruposProtocolo] g ON pp.idGrupoProtocolo = g.id
            JOIN [PR Protocolos] pr ON g.idProtocolo = pr.id
            LEFT JOIN [PR RespuestasProtocolo] rp ON r.idRT = rp.id
            LEFT JOIN [PR Respuestas] rt ON rp.idRespuesta = rt.id
            LEFT JOIN [VLISE_Visitas] v ON r.idVisita = v.idVisita
            WHERE pr.id IN (580, 581, 582, 583, 584, 585)
              AND r.fecha >= @fromDate
            ORDER BY r.fecha ASC
        `;

        const result = await req.query(query);
        const rows = result.recordset || [];
        log(`📥 Registros extraídos desde SALUS: ${rows.length}`);

        if (rows.length === 0) {
            log('No se encontraron nuevos registros.');
            await pool.close();
            return { total: 0, upserted: 0 };
        }

        // Mapear y sanear para Supabase
        const recordsToUpsert = rows.map(r => ({
            id_registro_salus: r.id_registro_salus,
            nhc: String(r.nhc || '').trim(),
            paciente: String(r.paciente || '').trim().toUpperCase(),
            id_paciente_salus: r.id_paciente_salus,
            id_visita: r.id_visita,
            id_hospitalizacion: r.id_hospitalizacion,
            fecha_hora: r.fecha_hora ? new Date(r.fecha_hora).toISOString() : null,
            protocolo_id: r.protocolo_id,
            protocolo_nombre: r.protocolo_nombre ? String(r.protocolo_nombre).trim() : 'Kinesiología',
            grupo_nombre: r.grupo_nombre ? String(r.grupo_nombre).trim() : null,
            parametro: r.parametro ? String(r.parametro).trim() : 'Parámetro',
            valor_numerico: r.valor_numerico !== null && !isNaN(r.valor_numerico) ? Number(r.valor_numerico) : null,
            valor_texto: r.valor_texto ? String(r.valor_texto).trim() : null,
            valor_combo: r.valor_combo ? String(r.valor_combo).trim() : null,
            unidades: r.unidades ? String(r.unidades).trim() : null,
            profesional: r.profesional ? String(r.profesional).trim() : null,
            updated_at: new Date().toISOString()
        })).filter(r => r.id_registro_salus && r.fecha_hora);

        log(`Preparados ${recordsToUpsert.length} registros para upsert en Supabase.`);

        // Inserción en lotes de 200
        const BATCH_SIZE = 200;
        let totalUpserted = 0;

        for (let i = 0; i < recordsToUpsert.length; i += BATCH_SIZE) {
            const batch = recordsToUpsert.slice(i, i + BATCH_SIZE);
            const { error } = await supabase
                .from('calidad_uci_kinesiologia')
                .upsert(batch, { onConflict: 'id_registro_salus' });

            if (error) {
                log(`❌ Error insertando lote ${i} - ${i + batch.length}: ${error.message}`);
            } else {
                totalUpserted += batch.length;
                if (totalUpserted % 1000 === 0 || totalUpserted === recordsToUpsert.length) {
                    log(`Progreso: ${totalUpserted}/${recordsToUpsert.length} registros guardados.`);
                }
            }
        }

        log(`✅ Sincronización finalizada con éxito. Total guardados: ${totalUpserted}`);
        await pool.close();
        return { total: rows.length, upserted: totalUpserted };

    } catch (err) {
        log(`❌ Error fatal en sincronización: ${err.message}`);
        if (pool) await pool.close();
        throw err;
    }
}

// Si se ejecuta directamente
if (process.argv[1] && process.argv[1].endsWith('sync_kinesiologia_uci.mjs')) {
    const from = process.argv[2] || '2026-06-01';
    syncKinesiologiaUci(from)
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
}
