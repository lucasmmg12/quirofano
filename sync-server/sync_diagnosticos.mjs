/**
 * sync_diagnosticos.mjs — Sincronizador de Diagnósticos Clínicos y Motivos de Consulta
 * Fuente: SALUS SQL Server -> [TABLEAU_Diagnosticos y motivo consulta]
 * Destino: Supabase -> calidad_pacientes_diagnosticos
 */

import sql from 'mssql';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '.env') });

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
        requestTimeout: 180000,
        connectionTimeout: 20000,
        tdsVersion: '7_4',
    },
    pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
};

function log(msg) {
    const ts = new Date().toISOString().replace('T', ' ').substring(0, 19);
    console.log(`[${ts}] [SYNC-DIAG] ${msg}`);
}

export async function syncDiagnosticos(fromDate = '2026-06-01') {
    log(`🩺 Iniciando extracción de diagnósticos desde SALUS (desde: ${fromDate})...`);
    let pool;
    try {
        pool = await sql.connect(SQL_CONFIG);
        log('Conectado a SALUS SQL Server.');

        const req = pool.request();
        req.input('fromDate', sql.Date, fromDate);

        const result = await req.query(`
            SELECT 
                NHC,
                DNI,
                paciente,
                IdVisita,
                [Fecha visita] AS fecha_visita,
                Motivo,
                diagnostico,
                Formulario,
                Centro
            FROM [TABLEAU_Diagnosticos y motivo consulta]
            WHERE [Fecha visita] >= @fromDate
              AND diagnostico IS NOT NULL 
              AND RTRIM(diagnostico) <> ''
            ORDER BY [Fecha visita] DESC
        `);

        const rows = result.recordset || [];
        log(`📥 Extraídos ${rows.length} registros de diagnóstico desde SALUS.`);

        if (rows.length === 0) {
            return { total: 0, inserted: 0, updated: 0 };
        }

        // Deduplicar en memoria por clave primaria lógica (id_visita + diagnostico)
        const dedupMap = new Map();
        for (const r of rows) {
            const idVisita = Number(r.IdVisita);
            const diag = String(r.diagnostico || '').trim();
            if (!idVisita || !diag) continue;

            const key = `${idVisita}|${diag}`;
            if (!dedupMap.has(key)) {
                dedupMap.set(key, {
                    nhc: String(r.NHC || '').trim(),
                    dni: String(r.DNI || '').trim(),
                    paciente: String(r.paciente || '').trim().toUpperCase(),
                    id_visita: idVisita,
                    fecha_visita: r.fecha_visita ? new Date(r.fecha_visita).toISOString() : null,
                    motivo: r.Motivo ? String(r.Motivo).trim() : null,
                    diagnostico: diag,
                    formulario: r.Formulario ? String(r.Formulario).trim() : null,
                    centro: r.Centro ? String(r.Centro).trim() : null,
                    updated_at: new Date().toISOString()
                });
            }
        }

        const cleanList = Array.from(dedupMap.values());
        log(`🧹 ${cleanList.length} registros únicos listos para upsert en Supabase.`);

        const BATCH_SIZE = 500;
        let totalUpserted = 0;

        for (let i = 0; i < cleanList.length; i += BATCH_SIZE) {
            const batch = cleanList.slice(i, i + BATCH_SIZE);
            const { error } = await supabase
                .from('calidad_pacientes_diagnosticos')
                .upsert(batch, { onConflict: 'id_visita,diagnostico' });

            if (error) {
                console.error(`❌ Error en lote de diagnósticos ${i / BATCH_SIZE + 1}:`, error.message);
            } else {
                totalUpserted += batch.length;
            }

            if ((i + BATCH_SIZE) % 5000 === 0 || i + BATCH_SIZE >= cleanList.length) {
                log(`   Progreso: ${Math.min(i + BATCH_SIZE, cleanList.length)} / ${cleanList.length} procesados.`);
            }
        }

        log(`✅ Sincronización de diagnósticos completada: ${totalUpserted} registros guardados en Supabase.`);
        return { total: rows.length, unique: cleanList.length, upserted: totalUpserted };
    } catch (err) {
        console.error('❌ Error en syncDiagnosticos:', err);
        throw err;
    } finally {
        if (pool) await pool.close();
    }
}

// Ejecución directa por CLI
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const fromArg = process.argv[2] || '2026-06-01';
    syncDiagnosticos(fromArg)
        .then(res => {
            console.log('Resultados:', res);
            process.exit(0);
        })
        .catch(err => {
            console.error('Fallo de ejecución:', err.message);
            process.exit(1);
        });
}
