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

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://hakysnqiryimxbwdslwe.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const SQL_CONFIG = {
    server: process.env.SALUS_DB_SERVER || '128.223.16.29',
    port: parseInt(process.env.SALUS_DB_PORT || '2450', 10),
    user: process.env.SALUS_DB_USER || 'SalusConsulta',
    password: process.env.SALUS_DB_PASSWORD || 'ConsultaSALUS1234',
    database: process.env.SALUS_DB_NAME || 'SALUS',
    options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true,
        requestTimeout: 60000,
        connectionTimeout: 20000,
        tdsVersion: '7_4',
    }
};

export function parseSpecialty(noteText) {
    if (!noteText) return 'Consulta Médica';
    const match = noteText.match(/especialidad\s*[:=]?\s*([^\r\n*]+)/i);
    return match ? match[1].trim() : 'Consulta Médica';
}

export async function syncDoctorParameters() {
    console.log('[SYNC-DOCTOR-PARAMS] Starting sync from SALUS...');
    let pool;
    try {
        pool = await sql.connect(SQL_CONFIG);

        // 1. Obtener notas diarias más recientes de agendas activas
        const query = `
            WITH UltimasNotas AS (
                SELECT 
                    and1.IdAgenda,
                    and1.FechaInicio,
                    and1.FechaFin,
                    and1.Descripcion,
                    ROW_NUMBER() OVER(PARTITION BY and1.IdAgenda ORDER BY and1.FechaInicio DESC) as rn
                FROM AgendaNotasDiarias and1
                WHERE and1.Descripcion IS NOT NULL AND LEN(LTRIM(RTRIM(and1.Descripcion))) > 3
            )
            SELECT 
                a.id as IdAgenda,
                a.Nombre as NombreAgenda,
                a.NombreAbrev as AgendaAbrev,
                un.Descripcion as NotaReciente
            FROM Agendas a
            LEFT JOIN UltimasNotas un ON a.id = un.IdAgenda AND un.rn = 1
            WHERE a.Activo = 1
        `;

        const resAgendas = await pool.request().query(query);
        console.log(`[SYNC-DOCTOR-PARAMS] Found ${resAgendas.recordset.length} active agendas in SALUS.`);

        // 2. Obtener ocupación de consultorios de hoy
        const queryConsultorios = `
            SELECT 
                v.idAgenda,
                MAX(v.NombreConsulta) as NombreConsulta
            FROM Visitas v
            WHERE CAST(v.Data AS DATE) = CAST(GETDATE() AS DATE)
              AND v.NombreConsulta IS NOT NULL AND LEN(LTRIM(RTRIM(v.NombreConsulta))) > 0
            GROUP BY v.idAgenda
        `;
        const resConsultorios = await pool.request().query(queryConsultorios);
        const consultoriosMap = {};
        for (const c of resConsultorios.recordset) {
            consultoriosMap[c.idAgenda] = c.NombreConsulta.trim();
        }

        // 3. Mapear registros
        const rowsToUpsert = [];
        for (const row of resAgendas.recordset) {
            const doctorName = row.NombreAgenda ? row.NombreAgenda.trim() : `Agenda ${row.IdAgenda}`;
            const specialty = parseSpecialty(row.NotaReciente);
            const consultorio = consultoriosMap[row.IdAgenda] || null;

            rowsToUpsert.push({
                id: `agenda_${row.IdAgenda}`,
                id_agenda: row.IdAgenda,
                id_personal: null,
                profesional_nombre: doctorName,
                especialidad: specialty,
                consultorio_actual: consultorio,
                condiciones_consulta: row.NotaReciente ? row.NotaReciente.trim() : null,
                updated_at: new Date().toISOString()
            });
        }

        console.log(`[SYNC-DOCTOR-PARAMS] Upserting ${rowsToUpsert.length} records into Supabase...`);

        // Batch upsert in chunks of 50
        const chunkSize = 50;
        let inserted = 0;
        for (let i = 0; i < rowsToUpsert.length; i += chunkSize) {
            const chunk = rowsToUpsert.slice(i, i + chunkSize);
            const { error } = await supabase
                .from('contact_center_doctor_parameters')
                .upsert(chunk, { onConflict: 'id' });
            
            if (error) {
                console.error(`[SYNC-DOCTOR-PARAMS] Chunk ${i} error:`, error.message);
            } else {
                inserted += chunk.length;
            }
        }

        console.log(`[SYNC-DOCTOR-PARAMS] Successfully synced ${inserted} doctor records.`);
        return { success: true, count: inserted };

    } catch (err) {
        console.error('[SYNC-DOCTOR-PARAMS] Error:', err.message);
        throw err;
    } finally {
        if (pool) await pool.close();
    }
}

// Ejecución directa si se invoca por CLI
if (process.argv[1] && process.argv[1].endsWith('sync_doctor_parameters.mjs')) {
    syncDoctorParameters().then(() => process.exit(0)).catch(e => {
        console.error(e);
        process.exit(1);
    });
}
