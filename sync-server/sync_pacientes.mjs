/**
 * sync_pacientes.mjs — Sincronizador del Padrón Maestro de Pacientes
 * Fuente: SALUS SQL Server -> PR_FICHA_PACIENTE_QRY
 * Destino: Supabase -> hospital_pacientes
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
        requestTimeout: 240000,
        connectionTimeout: 20000,
        tdsVersion: '7_4',
    },
    pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
};

function log(msg) {
    const ts = new Date().toISOString().replace('T', ' ').substring(0, 19);
    console.log(`[${ts}] [SYNC-PACIENTES] ${msg}`);
}

/**
 * Sanitiza y limpia el nombre del paciente
 */
export function sanitizePatientName(rawName) {
    if (!rawName) return '';
    let clean = String(rawName).trim();
    // Reemplazar comillas dobles escapadas
    clean = clean.replace(/""/g, "'");
    // Quitar comillas al inicio y final
    clean = clean.replace(/^["'\s]+|["'\s]+$/g, '');
    // Quitar caracteres espurios iniciales (guiones, puntos, asteriscos, pipes)
    clean = clean.replace(/^[\-_.*|/\\]+\s*/, '');
    // Quitar caracteres espurios finales
    clean = clean.replace(/\s*[\-_.*|/\\]+$/, '');
    return clean.trim();
}

/**
 * Detecta si el registro es una nota administrativa en lugar de un paciente real
 */
export function isAdministrativeNotice(name) {
    if (!name) return true;
    const upper = name.toUpperCase();
    return (
        upper.includes('NO DAR TURNOS') ||
        upper.includes('TIENE CIRUGIAS') ||
        upper.includes('NO ATENDERA') ||
        upper.includes('YA SE LLAMO') ||
        upper.includes('SIN TURNO') ||
        upper.includes('ATIENDE DE') ||
        upper === '0, 0' ||
        upper === 'A, A'
    );
}

/**
 * Sincroniza pacientes desde SALUS a hospital_pacientes en Supabase
 * @param {Object} options
 * @param {number} [options.days=30] - Cantidad de días hacia atrás a sincronizar
 * @param {string} [options.fromDate] - Fecha específica desde la cual sincronizar (YYYY-MM-DD)
 * @param {boolean} [options.all=false] - Si es true, sincroniza todos desde 2026-06-01
 * @param {Function} [options.onProgress] - Callback de progreso
 */
export async function syncPacientes(options = {}) {
    const startMs = Date.now();
    const days = options.days !== undefined ? Number(options.days) : 30;
    const fromDate = options.fromDate || (options.all ? '2026-06-01' : null);

    log(`Iniciando sincronización de pacientes (days=${days}, fromDate=${fromDate || 'calculado'})...`);

    let pool;
    try {
        pool = await new sql.ConnectionPool(SQL_CONFIG).connect();
        log('Conectado a SALUS SQL Server.');

        let query = `
            SELECT 
                id,
                nombre,
                nombre1,
                nombre2,
                NIF,
                NHC,
                fechaNacimiento,
                edad,
                sexo,
                email,
                mutua,
                telefono1,
                telefono2,
                Poblacion,
                EMP_nombrecomercial,
                FechaAlta,
                FechaActualizacion
            FROM PR_FICHA_PACIENTE_QRY
            WHERE tipoEntidad = 1
        `;

        if (fromDate) {
            query += ` AND (FechaActualizacion >= '${fromDate}' OR FechaAlta >= '${fromDate}')`;
        } else {
            query += ` AND (FechaActualizacion >= DATEADD(day, -${days}, GETDATE()) OR FechaAlta >= DATEADD(day, -${days}, GETDATE()))`;
        }

        log('Ejecutando consulta en SALUS...');
        const result = await pool.request().query(query);
        const rows = result.recordset || [];
        log(`Extraídos ${rows.length} registros desde SALUS.`);

        if (rows.length === 0) {
            return { success: true, totalExtracted: 0, uniqueCount: 0, upserted: 0, durationMs: Date.now() - startMs };
        }

        // Deduplicar por id_paciente y sanitizar
        const dedupMap = new Map();
        let skippedNotices = 0;

        for (const r of rows) {
            const id = Number(r.id);
            if (!id) continue;

            const rawName = r.nombre || `${r.nombre2 || ''}, ${r.nombre1 || ''}`;
            const cleanName = sanitizePatientName(rawName);

            if (isAdministrativeNotice(cleanName)) {
                skippedNotices++;
                continue;
            }

            // Formatear fecha de nacimiento a DD/MM/AAAA
            let fechaNac = null;
            if (r.fechaNacimiento) {
                if (r.fechaNacimiento instanceof Date && !isNaN(r.fechaNacimiento.getTime())) {
                    const d = String(r.fechaNacimiento.getUTCDate()).padStart(2, '0');
                    const m = String(r.fechaNacimiento.getUTCMonth() + 1).padStart(2, '0');
                    const y = r.fechaNacimiento.getUTCFullYear();
                    fechaNac = `${d}/${m}/${y}`;
                } else {
                    const parts = String(r.fechaNacimiento).split('T')[0].split('-');
                    if (parts.length === 3) {
                        fechaNac = `${parts[2]}/${parts[1]}/${parts[0]}`;
                    }
                }
            }

            if (!dedupMap.has(id)) {
                dedupMap.set(id, {
                    id_paciente: id,
                    nombre: cleanName || rawName.trim(),
                    dni: r.NIF ? String(r.NIF).trim() : null,
                    nhc: r.NHC ? String(r.NHC).trim() : null,
                    fecha_nacimiento: fechaNac,
                    edad: r.edad != null ? String(r.edad) : null,
                    sexo: r.sexo ? String(r.sexo).trim().toUpperCase() : null,
                    email: r.email ? String(r.email).trim() : null,
                    centro: r.EMP_nombrecomercial ? String(r.EMP_nombrecomercial).trim() : (r.Poblacion ? String(r.Poblacion).trim() : null),
                    coseguro: r.mutua ? String(r.mutua).trim() : null,
                    telefono: (r.telefono1 && String(r.telefono1).trim()) || (r.telefono2 && String(r.telefono2).trim()) || null,
                    manual: false,
                    updated_at: new Date().toISOString()
                });
            }
        }

        const cleanList = Array.from(dedupMap.values());
        log(`Filtrados: ${cleanList.length} pacientes únicos (omitidos ${skippedNotices} avisos administrativos).`);

        // Upsert por lotes de 500
        const BATCH_SIZE = 500;
        let totalUpserted = 0;
        let errors = 0;

        for (let i = 0; i < cleanList.length; i += BATCH_SIZE) {
            const batch = cleanList.slice(i, i + BATCH_SIZE);
            const { error } = await supabase
                .from('hospital_pacientes')
                .upsert(batch, { onConflict: 'id_paciente' });

            if (error) {
                console.error(`Error en lote ${Math.floor(i / BATCH_SIZE) + 1}:`, error.message);
                errors++;
            } else {
                totalUpserted += batch.length;
            }

            if ((i + BATCH_SIZE) % 2500 === 0 || i + BATCH_SIZE >= cleanList.length) {
                log(`Progreso: ${Math.min(i + BATCH_SIZE, cleanList.length)} / ${cleanList.length} procesados.`);
            }
        }

        const durationMs = Date.now() - startMs;
        log(`Sincronización completada en ${(durationMs / 1000).toFixed(1)}s: ${totalUpserted} pacientes actualizados.`);

        return {
            success: true,
            totalExtracted: rows.length,
            uniqueCount: cleanList.length,
            upserted: totalUpserted,
            skippedNotices,
            errors,
            durationMs
        };

    } catch (err) {
        log(`Error en syncPacientes: ${err.message}`);
        throw err;
    } finally {
        if (pool) await pool.close();
    }
}

/**
 * Sincroniza un paciente individual por DNI, NHC o ID
 */
export async function syncSinglePaciente(identifier) {
    if (!identifier) throw new Error('Identificador requerido');
    const cleanId = String(identifier).trim().replace(/\D/g, '');
    if (!cleanId) throw new Error('Identificador numérico inválido');

    log(`Buscando paciente individual: ${cleanId}...`);
    let pool;
    try {
        pool = await new sql.ConnectionPool(SQL_CONFIG).connect();
        const result = await pool.request()
            .input('id', sql.VarChar(50), cleanId)
            .query(`
                SELECT TOP 1
                    id,
                    nombre,
                    nombre1,
                    nombre2,
                    NIF,
                    NHC,
                    edad,
                    sexo,
                    email,
                    mutua,
                    telefono1,
                    telefono2,
                    Poblacion,
                    EMP_nombrecomercial,
                    FechaAlta,
                    FechaActualizacion
                FROM PR_FICHA_PACIENTE_QRY
                WHERE tipoEntidad = 1
                  AND (NIF = @id OR NIF LIKE '%' + @id OR NHC = @id OR id = TRY_CAST(@id AS INT))
            `);

        if (!result.recordset || result.recordset.length === 0) {
            return { success: true, paciente: null };
        }

        const r = result.recordset[0];
        const rawName = r.nombre || `${r.nombre2 || ''}, ${r.nombre1 || ''}`;
        const cleanName = sanitizePatientName(rawName);

        const pacRecord = {
            id_paciente: r.id,
            nombre: cleanName || rawName.trim(),
            dni: r.NIF ? String(r.NIF).trim() : null,
            nhc: r.NHC ? String(r.NHC).trim() : null,
            edad: r.edad != null ? String(r.edad) : null,
            sexo: r.sexo ? String(r.sexo).trim().toUpperCase() : null,
            email: r.email ? String(r.email).trim() : null,
            centro: r.EMP_nombrecomercial ? String(r.EMP_nombrecomercial).trim() : (r.Poblacion ? String(r.Poblacion).trim() : null),
            coseguro: r.mutua ? String(r.mutua).trim() : null,
            telefono: (r.telefono1 && String(r.telefono1).trim()) || (r.telefono2 && String(r.telefono2).trim()) || null,
            manual: false,
            updated_at: new Date().toISOString()
        };

        const { data, error } = await supabase
            .from('hospital_pacientes')
            .upsert(pacRecord, { onConflict: 'id_paciente' })
            .select();

        if (error) {
            console.error('Error guardando en hospital_pacientes:', error.message);
            throw error;
        }

        return { success: true, paciente: data?.[0] || pacRecord };
    } finally {
        if (pool) await pool.close();
    }
}

// Ejecución CLI si se llama directamente
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const daysArg = process.argv[2] ? Number(process.argv[2]) : 30;
    syncPacientes({ days: daysArg })
        .then(res => {
            console.log('Resultado:', res);
            process.exit(0);
        })
        .catch(err => {
            console.error('Error CLI:', err);
            process.exit(1);
        });
}
