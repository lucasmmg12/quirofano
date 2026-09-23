/**
 * SALUS Sync Server — ETL autónomo
 * =================================
 * Servidor Express que:
 *   1. Conecta a SQL Server SALUS (red local)
 *   2. Ejecuta las queries de extracción
 *   3. Procesa y transforma los datos
 *   4. Inserta directamente en Supabase
 *
 * El frontend solo necesita llamar /api/salus/sync-all para disparar todo.
 * No requiere que Vite esté corriendo.
 *
 * Uso: doble click en "Actualizar SALUS.bat" o: cd sync-server && npm start
 */

import express from 'express';
import cors from 'cors';
import sql from 'mssql';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { syncCensoCamas } from './sync_censo_camas.mjs';
import { syncDiagnosticos } from './sync_diagnosticos.mjs';
import { syncKinesiologiaUci } from './sync_kinesiologia_uci.mjs';
import { syncPacientes, syncSinglePaciente } from './sync_pacientes.mjs';
import { getTurnosOnlineDuplicados, setGestionTurnoOnline, syncTurnosOnlineToSupabase, parseOnlineComment } from './sync_turnos_online.mjs';
import { syncDoctorParameters } from './sync_doctor_parameters.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Cargar .env: primero buscar en el directorio actual, luego en el padre
const envLocal = resolve(__dirname, '.env');
const envParent = resolve(__dirname, '..', '.env');
config({ path: fs.existsSync(envLocal) ? envLocal : envParent });

const app = express();
const PORT = process.env.PORT || 3456;

// â”€â”€ Supabase Client â”€â”€
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// â”€â”€ SQL Server Config â”€â”€
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
        requestTimeout: 120000,    // 2min para queries pesadas
        connectionTimeout: 15000,
        tdsVersion: '7_4',
    },
    pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
};

// ── Pool de conexiones ──
let pool = null;
async function getPool() {
    if (pool && !pool.connected) {
        try { await pool.close(); } catch (_) {}
        pool = null;
    }
    if (!pool || !pool.connected) {
        console.log('🔌 Conectando a SQL Server SALUS...');
        pool = await sql.connect(SQL_CONFIG);
        pool.on('error', err => {
            console.warn('⚠️ Error en pool SQL Server SALUS (se reiniciará):', err.message);
            pool = null;
        });
        console.log('✅ Conectado a SALUS');
    }
    return pool;
}

// ── Middleware ──
app.use(cors({ origin: '*', methods: ['GET', 'POST'] }));
app.use(express.json());

// ─── Turnos Online Duplicados (Contact Center) ───
app.get('/api/salus/turnos-online/duplicados', async (req, res) => {
    try {
        const pool = await getPool();
        const days = parseInt(req.query.days || '1', 10);
        const targetDate = req.query.date || null;
        
        console.log(`🔍 [Turnos Online] Consultando e sincronizando inconsistencias (days: ${days}, date: ${targetDate || 'auto'})...`);
        const data = await syncTurnosOnlineToSupabase(pool, { days, targetDate, supabaseClient: supabase });
        res.json({ success: true, ...data });
    } catch (err) {
        console.error('❌ Error consultando turnos online duplicados:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/salus/turnos-online/sync', async (req, res) => {
    try {
        const pool = await getPool();
        const days = parseInt(req.body.days || '2', 10);
        const data = await syncTurnosOnlineToSupabase(pool, { days, supabaseClient: supabase });
        res.json({ success: true, ...data });
    } catch (err) {
        console.error('❌ Error sincronizando turnos online:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/salus/turnos-online/gestion', async (req, res) => {
    try {
        const { key, estado, agenteId, agenteNombre, notas, templateName } = req.body;
        if (!key) {
            return res.status(400).json({ success: false, error: 'Key requerida (dni_prestadorId)' });
        }
        const updated = setGestionTurnoOnline({ key, estado, agenteId, agenteNombre, notas, templateName });
        res.json({ success: true, gestion: updated });
    } catch (err) {
        console.error('❌ Error guardando gestión de turno online:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─── Historial Clínico Completo + Turnos Próximos & Online de un Paciente ───
async function getPacienteHistorialClinico(pool, { dni, nhc, telefono, nombre }) {
    const startTime = Date.now();
    let resolvedNhc = nhc ? String(nhc).trim() : null;
    let resolvedDni = dni ? String(dni).replace(/\D/g, '') : null;
    const cleanTel = telefono ? String(telefono).replace(/\D/g, '').slice(-8) : null;

    // 1. Si no tenemos NHC, resolver en PR_FICHA_PACIENTE_QRY de SALUS
    if (!resolvedNhc && (resolvedDni || cleanTel)) {
        try {
            let pWhere = [];
            if (resolvedDni && resolvedDni.length >= 6) {
                pWhere.push(`NIF = '${resolvedDni}'`);
            } else if (cleanTel && cleanTel.length >= 6) {
                pWhere.push(`telefono1 LIKE '%${cleanTel}%'`, `telefono2 LIKE '%${cleanTel}%'`);
            }

            if (pWhere.length > 0) {
                const pacRes = await pool.request().query(`
                    SELECT TOP 1 NHC, NIF, nombre, telefono1, telefono2 
                    FROM PR_FICHA_PACIENTE_QRY 
                    WHERE ${pWhere.join(' OR ')}
                `);
                if (pacRes.recordset && pacRes.recordset.length > 0) {
                    resolvedNhc = pacRes.recordset[0].NHC;
                    resolvedDni = resolvedDni || pacRes.recordset[0].NIF;
                }
            }
        } catch (err) {
            console.warn('⚠️ [Historial Clinico] Error resolviendo NHC en PR_FICHA_PACIENTE_QRY:', err.message);
        }
    }

    // Query A: TABLEAU_Visitas (consultas médicas, guardia y turnos)
    let visitasPromise = Promise.resolve({ recordset: [] });
    if (resolvedNhc) {
        visitasPromise = pool.request().query(`
            SELECT 
                v.IdVisita,
                v.Fecha,
                v.HoraProgramada,
                v.Agenda,
                v.Responsable,
                v.[Tipo de visita] AS tipo_visita,
                v.Asistencia,
                v.Cliente,
                v.CentroVisita,
                v.Paciente,
                v.NHC
            FROM [SALUS].[dbo].[TABLEAU_Visitas] v
            WHERE v.NHC = '${resolvedNhc}'
            ORDER BY v.IdVisita DESC
        `);
    }

    // Query B: TABLEAU_Diagnosticos y motivo consulta (anamnesis, síntomas del formulario y diagnósticos)
    let diagPromise = Promise.resolve({ recordset: [] });
    if (resolvedNhc) {
        diagPromise = pool.request().query(`
            SELECT 
                d.IdVisita,
                d.NHC,
                d.DNI,
                d.paciente,
                d.[Fecha visita] AS fecha_visita,
                d.diagnostico,
                d.Formulario,
                d.Motivo,
                d.Centro
            FROM [SALUS].[dbo].[TABLEAU_Diagnosticos y motivo consulta] d
            WHERE d.NHC = '${resolvedNhc}'
            ORDER BY d.IdVisita DESC
        `);
    }

    // Query C: Turnos Online (Consultar Supabase contact_center_turnos_online donde ya están indexados por DNI)
    let onlineTurnosList = [];
    if (resolvedDni) {
        try {
            const { data: turnosOnlineSb } = await supabase
                .from('contact_center_turnos_online')
                .select('*')
                .eq('dni', resolvedDni);

            if (turnosOnlineSb && turnosOnlineSb.length > 0) {
                for (const row of turnosOnlineSb) {
                    if (Array.isArray(row.turnos)) {
                        for (const t of row.turnos) {
                            onlineTurnosList.push({
                                id_visita: t.idVisita,
                                fecha_visita: t.fechaTurno,
                                fecha_iso: t.fechaTurno,
                                hora_visita: t.horaInicio,
                                agenda: t.agenda || row.agenda_nombre,
                                medico: row.prestador_nombre || 'Profesional Asignado',
                                tipo_visita: 'Turno Web Online',
                                asistencia: 'Reservado Online',
                                cliente: 'Particular / Prepaga',
                                paciente: row.paciente_nombre,
                                dni: row.dni,
                                telefono: row.telefono,
                                email: row.email,
                                motivo: t.motivo || 'Turno Web',
                                origen: 'online',
                                tipo: 'online'
                            });
                        }
                    }
                }

                // Validación en vivo contra SALUS: si el turno fue borrado en SALUS, eliminarlo de la lista y de Supabase
                if (onlineTurnosList.length > 0 && pool) {
                    try {
                        const idVisitas = onlineTurnosList.map(t => t.id_visita).filter(Boolean);
                        if (idVisitas.length > 0) {
                            const checkVisitas = await pool.request().query(`
                                SELECT id FROM Visitas WHERE id IN (${idVisitas.join(',')})
                            `);
                            const existingIds = new Set(checkVisitas.recordset.map(r => r.id));
                            const invalidIds = idVisitas.filter(id => !existingIds.has(id));

                            if (invalidIds.length > 0) {
                                console.log(`[Historial Clinico] 🗑️ Turnos online eliminados en SALUS detectados: ${invalidIds.join(', ')}. Purgando...`);
                                onlineTurnosList = onlineTurnosList.filter(t => existingIds.has(t.id_visita));
                                for (const row of turnosOnlineSb) {
                                    if (Array.isArray(row.turnos)) {
                                        const validTurnos = row.turnos.filter(t => existingIds.has(t.idVisita));
                                        if (validTurnos.length === 0) {
                                            await supabase.from('contact_center_turnos_online').delete().eq('id', row.id);
                                        } else if (validTurnos.length !== row.turnos.length) {
                                            await supabase.from('contact_center_turnos_online').update({
                                                turnos: validTurnos,
                                                total_turnos: validTurnos.length
                                            }).eq('id', row.id);
                                        }
                                    }
                                }
                            }
                        }
                    } catch (errCheck) {
                        console.warn('⚠️ Error verificando existencia de turnos online en SALUS:', errCheck.message);
                    }
                }
            }
        } catch (e) {
            console.warn('⚠️ Error consultando turnos online en Supabase:', e.message);
        }
    }

    const [visitasRes, diagRes] = await Promise.all([visitasPromise, diagPromise]);

    const diagMap = new Map();
    if (diagRes.recordset) {
        for (const d of diagRes.recordset) {
            diagMap.set(d.IdVisita, d);
        }
    }

    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);

    const consultas = [];
    const turnosProximos = [];

    // Procesar visitas de SALUS
    if (visitasRes.recordset) {
        for (const v of visitasRes.recordset) {
            const diag = diagMap.get(v.IdVisita);
            
            let fechaObj = null;
            if (v.Fecha) {
                const parts = String(v.Fecha).split('/');
                if (parts.length === 3) {
                    fechaObj = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
                }
            }

            const isFutura = fechaObj && fechaObj >= todayDate;
            const esTurnoPendiente = isFutura && (v.Asistencia === 'Programada' || !v.Asistencia || v.Asistencia === 'Pendiente');

            const record = {
                id_visita: v.IdVisita,
                fecha_visita: v.Fecha,
                hora_visita: v.HoraProgramada ? String(v.HoraProgramada).slice(0, 5) : '',
                agenda: v.Agenda,
                medico: v.Responsable,
                tipo_visita: v.tipo_visita,
                asistencia: v.Asistencia,
                cliente: v.Cliente,
                centro: v.CentroVisita,
                paciente: v.Paciente,
                nhc: v.NHC,
                diagnostico: diag?.diagnostico || null,
                motivo: diag?.Motivo ? String(diag.Motivo).trim() : null,
                formulario: diag?.Formulario || null,
                origen: 'salus_presencial'
            };

            if (esTurnoPendiente) {
                turnosProximos.push({
                    ...record,
                    tipo: 'presencial'
                });
            }
            consultas.push(record);
        }
    }

    // Procesar turnos online próximos
    if (onlineTurnosList.length > 0) {
        turnosProximos.push(...onlineTurnosList);
    }

    // Ordenar turnos próximos por fecha ascendente
    turnosProximos.sort((a, b) => {
        const da = a.fecha_iso || a.fecha_visita;
        const db = b.fecha_iso || b.fecha_visita;
        return da > db ? 1 : -1;
    });

    return {
        elapsedMs: Date.now() - startTime,
        nhc: resolvedNhc,
        dni: resolvedDni,
        totalConsultas: consultas.length,
        totalTurnosProximos: turnosProximos.length,
        turnosProximos,
        consultas
    };
}

app.get('/api/salus/paciente-historial-clinico', async (req, res) => {
    try {
        const pool = await getPool();
        const { dni, nhc, telefono, nombre } = req.query;
        if (!dni && !nhc && !telefono && !nombre) {
            return res.status(400).json({ success: false, error: 'Se requiere dni, nhc, telefono o nombre' });
        }
        console.log(`🩺 [Historial Clínico] Consultando paciente (DNI: ${dni || 'N/A'}, NHC: ${nhc || 'N/A'}, Tel: ${telefono || 'N/A'})...`);
        const data = await getPacienteHistorialClinico(pool, { dni, nhc, telefono, nombre });
        res.json({ success: true, ...data });
    } catch (err) {
        console.error('❌ Error consultando historial clínico del paciente:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── Helpers ──

function formatDate(val) {
    if (!val) return null;
    if (val instanceof Date) {
        // CRÍTICO: Usar métodos UTC para evitar desplazamiento por timezone.
        // SQL Server DATE llega como midnight UTC (ej: 2026-03-31T00:00:00.000Z).
        // En Argentina (UTC-3), getDate() devuelve el día ANTERIOR (30 en vez de 31).
        // getUTCDate() siempre devuelve el día correcto del valor original.
        const y = val.getUTCFullYear();
        const m = String(val.getUTCMonth() + 1).padStart(2, '0');
        const d = String(val.getUTCDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    // Si no es Date, puede ser un string ISO — extraer solo la parte de fecha
    const str = String(val);
    const isoMatch = str.match(/^(\d{4}-\d{2}-\d{2})/);
    if (isoMatch) return isoMatch[1];
    // dd/mm/yyyy or dd-mm-yyyy (formato argentino)
    const dmy = str.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
    if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
    return str;
}

function stripRtf(rtf) {
    if (!rtf || typeof rtf !== 'string' || !rtf.startsWith('{\\rtf')) return rtf || null;
    return rtf
        .replace(/\{\\[^{}]*\}/g, '')
        .replace(/\\[a-z]+\d*\s?/gi, '')
        .replace(/[{}]/g, '')
        .replace(/\r?\n/g, ' ')
        .replace(/\s+/g, ' ')
        .trim() || null;
}

function normalizeNameForUpsert(name) {
    if (!name) return '';
    return name
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[,.\-_]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toUpperCase();
}

function normalizePhone(raw, areaCode = '264') {
    if (!raw) return { normalized: '', valid: false, original: raw };
    let cleaned = String(raw).replace(/\D/g, '');
    // Ya tiene formato 549XXXXXXXXXX
    if (cleaned.startsWith('549') && cleaned.length === 13) {
        return { normalized: cleaned, valid: true, original: raw };
    }
    // Tiene 10 dígitos (con código de área)
    if (cleaned.length === 10 && !cleaned.startsWith('0')) {
        return { normalized: '549' + cleaned, valid: true, original: raw };
    }
    // 8 dígitos (sin código de área)
    if (cleaned.length >= 7 && cleaned.length <= 8) {
        return { normalized: '549' + areaCode + cleaned, valid: true, original: raw };
    }
    return { normalized: cleaned, valid: false, original: raw };
}

// Módulos excluidos
const EXCLUDED_MODULES = ['Transferencia embrionaria', 'Fertilidad', 'Bloque Médico'];
const EXCLUDED_NAME_PREFIXES = ['BLOQUE'];

// ============================================================================
// SYNC UCI (TERAPIA INTENSIVA) — SQL Server → Supabase
// ============================================================================
async function syncUci(db, fastSync = false) {
    console.log(`🫁 [0/X] Extrayendo indicadores de UCI (Terapia Intensiva)... (fastSync: ${fastSync})`);
    
    const dateFilter = fastSync
        ? "[Fecha ingreso] >= DATEADD(DAY, -30, CAST(GETDATE() AS DATE))"
        : "YEAR([Fecha ingreso]) IN (2022, 2023, 2024, 2025, 2026)";

    const result = await db.request().query(`
        SELECT 
            [Número admisión],
            [Fecha ingreso],
            [Fecha alta],
            Especialidad,
            Procedencia,
            NHC,
            Paciente,
            [Motivo de alta],
            Cliente,
            idAdmision,
            [Estado Conceptos],
            Servicio,
            Proceso,
            Edad,
            [Motivo Alta],
            [Control ADM finalizado]
        FROM TABLEAU_Admisiones
        WHERE Especialidad = 'TERAPIA INTENSIVA'
          AND ${dateFilter}
        ORDER BY [Fecha ingreso] DESC
    `);

    const records = result.recordset;
    console.log(`   📥 ${records.length} registros extraídos de Terapia Intensiva`);

    if (records.length === 0) {
        return { total: 0, inserted: 0, updated: 0, skipped: 0 };
    }

    // Mapear los datos para el formato de Supabase
    const dataToUpsert = records.map(r => ({
        id_admision: r.idAdmision,
        numero_admision: r['Número admisión'] ? String(r['Número admisión']).trim() : null,
        fecha_ingreso: formatDate(r['Fecha ingreso']),
        fecha_alta: formatDate(r['Fecha alta']),
        especialidad: r.Especialidad ? String(r.Especialidad).trim() : null,
        procedencia: r.Procedencia ? String(r.Procedencia).trim() : null,
        nhc: r.NHC ? String(r.NHC).trim() : null,
        paciente: r.Paciente ? String(r.Paciente).trim() : null,
        motivo_de_alta: r['Motivo de alta'] ? String(r['Motivo de alta']).trim() : null,
        cliente: r.Cliente ? String(r.Cliente).trim() : null,
        estado_conceptos: r['Estado Conceptos'] ? String(r['Estado Conceptos']).trim() : null,
        servicio: r.Servicio ? String(r.Servicio).trim() : null,
        proceso: r.Proceso ? String(r.Proceso).trim() : null,
        edad: typeof r.Edad === 'number' ? r.Edad : parseInt(r.Edad, 10) || null,
        motivo_alta_2: r['Motivo Alta'] ? String(r['Motivo Alta']).trim() : null,
        control_adm_finalizado: r['Control ADM finalizado'] ? String(r['Control ADM finalizado']).trim() : null,
        updated_at: new Date().toISOString()
    }));

    // Lotes de 500 para evitar timeout en la API
    const BATCH_SIZE = 500;
    let inserted = 0, updated = 0, skipped = 0;

    for (let i = 0; i < dataToUpsert.length; i += BATCH_SIZE) {
        const batch = dataToUpsert.slice(i, i + BATCH_SIZE);
        const { data, error } = await supabase
            .from('calidad_uci_admisiones')
            .upsert(batch, { onConflict: 'id_admision', ignoreDuplicates: false })
            .select('id_admision, created_at, updated_at');
        
        if (error) {
            console.error(`   ❌ Error en el lote ${i/BATCH_SIZE + 1}:`, error.message);
            skipped += batch.length;
        } else if (data) {
            data.forEach(d => {
                const isNew = Math.abs(new Date(d.created_at) - new Date(d.updated_at)) < 2000;
                if (isNew) inserted++;
                else updated++;
            });
        }
    }

    const summary = { total: records.length, inserted, updated, skipped };
    console.log(`   –… UCI: ${inserted} nuevos, ${updated} actualizados, ${skipped} errores`);
    return summary;
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// SYNC CIRUGÍAS — SQL Server â†’ Supabase
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
async function syncCirugias(db) {
    console.log('📋 [1/7] Extrayendo cirugías de SALUS...');
    const result = await db.request().query(`
        SELECT TOP 400
            CAST(A.Data AS DATE) AS Data_Fecha,
            A.idPaciente, A.nombre, A.telefono1, A.Descrip,
            A.mutua, A.Ausente, A.GrupoAgendas, Q.Doctor,
            V.Instrucciones AS Instrucciones_RTF
        FROM _PR_AGENDA_QRY_SENZILL A
        LEFT JOIN _PR_AGENDA_QRY_QUIROFAN Q 
            ON A.idPaciente = Q.idPaciente 
            AND CAST(A.Data AS DATE) = CAST(Q.Data AS DATE) 
        OUTER APPLY (
            SELECT TOP 1 Instrucciones
            FROM VLIS_PeticionesPruebas_SERVICIO V_Sub
            WHERE V_Sub.IdPaciente = A.idPaciente
              AND CAST(V_Sub.[Fecha Solicitud] AS DATE) <= CAST(A.Data AS DATE)
              AND V_Sub.Instrucciones IS NOT NULL 
            ORDER BY V_Sub.[Fecha Solicitud] DESC
        ) V
        WHERE A.Descrip LIKE '(CX)%'
          AND A.nombre NOT LIKE '%Bloque%'
          AND A.GrupoAgendas IN (N'QUIRÓFANOS CENTRALES', N'QUIRÓFANOS HdD')
          AND CAST(A.Data AS DATE) >= DATEADD(DAY, -7, CAST(GETDATE() AS DATE))
        ORDER BY A.Data DESC
    `);
    console.log(`   📥 ${result.recordset.length} registros extraídos`);

    // Transformar y preparar para upsert
    const records = [];
    const FIELDS_TO_PRESERVE = [
        'status', 'notificado_at', 'documentacion_recibida_at', 'autorizado_at',
        'confirmado_at', 'archivos', 'whatsapp_message_id', 'ultimo_mensaje_at',
        'notas', 'operador', 'telefono'
    ];

    for (const r of result.recordset) {
        const nombre = r.nombre?.trim();
        if (!nombre || !r.idPaciente) continue;
        const nombreUpper = nombre.toUpperCase();
        if (EXCLUDED_NAME_PREFIXES.some(p => nombreUpper.startsWith(p))) continue;

        const descripcion = r.Descrip || '';
        const excluido = EXCLUDED_MODULES.some(mod => descripcion.toLowerCase().includes(mod.toLowerCase()));
        const phone = normalizePhone(r.telefono1 ? String(r.telefono1) : '');

        records.push({
            id_paciente: String(r.idPaciente),
            nombre: normalizeNameForUpsert(nombre),
            fecha_cirugia: formatDate(r.Data_Fecha),
            telefono: phone.normalized || '',
            telefono_original: phone.original || '',
            descripcion: descripcion,
            modulo: descripcion,
            obra_social: r.mutua || null,
            ausente: r.Ausente != null ? String(r.Ausente).trim() : null,
            grupo_agendas: r.GrupoAgendas || null,
            medico: r.Doctor || r.GrupoAgendas || null,
            instrucciones: stripRtf(r.Instrucciones_RTF),
            excluido,
        });
    }

    // ── ENRIQUECER CON DNI DESDE SUPABASE ──
    // Fuente 1: asociaciones_cirugias (match por nombre normalizado)
    const dniByName = new Map();
    let dniOffset = 0;
    let hasMoreDni = true;
    while (hasMoreDni) {
        const { data: asocRows } = await supabase
            .from('asociaciones_cirugias')
            .select('nombre_paciente, dni')
            .not('dni', 'is', null)
            .range(dniOffset, dniOffset + 499);

        if (asocRows && asocRows.length > 0) {
            for (const row of asocRows) {
                if (row.dni && row.nombre_paciente) {
                    const key = normalizeNameForUpsert(row.nombre_paciente);
                    if (!dniByName.has(key)) dniByName.set(key, String(row.dni).trim());
                }
            }
            dniOffset += 500;
            hasMoreDni = asocRows.length === 500;
        } else {
            hasMoreDni = false;
        }
    }

    // Fuente 2: deudas_pacientes (match exacto por id_paciente_salus)
    const dniById = new Map();
    const uniqueIds = [...new Set(records.map(r => r.id_paciente))];
    const DNI_BATCH = 200;
    for (let i = 0; i < uniqueIds.length; i += DNI_BATCH) {
        const batch = uniqueIds.slice(i, i + DNI_BATCH);
        const { data: deudasRows } = await supabase
            .from('deudas_pacientes')
            .select('id_paciente_salus, dni')
            .in('id_paciente_salus', batch)
            .not('dni', 'is', null);

        if (deudasRows) {
            for (const row of deudasRows) {
                if (row.dni && row.id_paciente_salus) {
                    dniById.set(row.id_paciente_salus, String(row.dni).trim());
                }
            }
        }
    }

    // Aplicar DNI: prioridad id_paciente (exacto) > nombre (fuzzy)
    let dniMatched = 0;
    for (const record of records) {
        const dniExacto = dniById.get(record.id_paciente);
        const dniPorNombre = dniByName.get(record.nombre);
        record.dni = dniExacto || dniPorNombre || null;
        if (record.dni) dniMatched++;
    }
    console.log(`   🪪 ${dniMatched}/${records.length} cirugías enriquecidas con DNI (${dniByName.size} por nombre, ${dniById.size} por id)`);

    // Filtrar registros con datos completos para upsert
    const validRecords = records.filter(r => r.id_paciente && r.nombre && r.fecha_cirugia);

    // Deduplicar (último gana)
    const deduped = new Map();
    for (const row of validRecords) {
        const key = `${row.id_paciente}|${row.nombre}|${row.fecha_cirugia}`;
        deduped.set(key, row);
    }

    const patientIds = [...new Set([...deduped.values()].map(r => r.id_paciente))];

    // â”€â”€ PASO 1: Obtener estados existentes para preservarlos â”€â”€
    // IMPORTANTE: Capturar estados ANTES de cualquier eliminación
    const FIELDS_TO_PRESERVE_QUERY = FIELDS_TO_PRESERVE.join(', ');
    const existingMap = new Map();

    if (patientIds.length > 0) {
        const FETCH_BATCH = 200;
        for (let i = 0; i < patientIds.length; i += FETCH_BATCH) {
            const batch = patientIds.slice(i, i + FETCH_BATCH);
            const { data: existing } = await supabase
                .from('surgeries')
                .select(`id_paciente, fecha_cirugia, nombre, ${FIELDS_TO_PRESERVE_QUERY}`)
                .in('id_paciente', batch);

            if (existing) {
                for (const row of existing) {
                    // Guardar con la clave de la fecha CORRECTA (SALUS) para que el upsert la encuentre
                    const normalizedName = normalizeNameForUpsert(row.nombre);
                    const key = `${row.id_paciente}|${normalizedName}|${row.fecha_cirugia}`;
                    const preserved = {};
                    for (const f of FIELDS_TO_PRESERVE) {
                        if (row[f] != null) preserved[f] = row[f];
                    }
                    if (Object.keys(preserved).length > 0) existingMap.set(key, preserved);
                }
            }
        }
    }
    console.log(`   🔒 ${existingMap.size} registros con estados a preservar`);

    // â”€â”€ PASO 2: Limpiar registros huérfanos con fechas incorrectas â”€â”€
    // Detectar registros en Supabase cuya fecha NO coincide con SALUS.
    // Estos son restos del bug de timezone (fecha -1 día) o reprogramaciones.
    // Se ELIMINAN directamente. El upsert posterior los recreará con la fecha correcta
    // y los estados se preservan via existingMap.
    if (patientIds.length > 0) {
        // Crear mapa de SALUS: id_paciente+nombre â†’ fecha más reciente
        const salusDateMap = new Map();
        for (const row of deduped.values()) {
            if (row.ausente === '0' || row.ausente === '1') continue;
            const pKey = `${row.id_paciente}|${row.nombre}`;
            const existing = salusDateMap.get(pKey);
            if (!existing || row.fecha_cirugia > existing) {
                salusDateMap.set(pKey, row.fecha_cirugia);
            }
        }

        const FETCH_BATCH = 200;
        let cleaned = 0;
        for (let i = 0; i < patientIds.length; i += FETCH_BATCH) {
            const batch = patientIds.slice(i, i + FETCH_BATCH);
            const { data: existing } = await supabase
                .from('surgeries')
                .select('id, id_paciente, nombre, fecha_cirugia, ausente')
                .in('id_paciente', batch)
                .is('ausente', null);

            if (existing) {
                for (const row of existing) {
                    const pKey = `${row.id_paciente}|${normalizeNameForUpsert(row.nombre)}`;
                    const salusDate = salusDateMap.get(pKey);
                    if (salusDate && row.fecha_cirugia !== salusDate) {
                        // La fecha en Supabase no coincide con SALUS â†’ eliminar el registro obsoleto
                        // El upsert posterior creará el registro con la fecha correcta
                        console.log(`   🖑ï¸ Eliminando obsoleto: ${row.nombre} ${row.fecha_cirugia} (correcto: ${salusDate})`);
                        const { error: delErr } = await supabase
                            .from('surgeries')
                            .delete()
                            .eq('id', row.id);
                        if (!delErr) {
                            cleaned++;
                            // Mover los estados preservados a la key con fecha correcta
                            const oldKey = `${row.id_paciente}|${normalizeNameForUpsert(row.nombre)}|${row.fecha_cirugia}`;
                            const newKey = `${row.id_paciente}|${normalizeNameForUpsert(row.nombre)}|${salusDate}`;
                            const preserved = existingMap.get(oldKey);
                            if (preserved && !existingMap.has(newKey)) {
                                existingMap.set(newKey, preserved);
                            }
                        } else {
                            console.error(`   âŒ Error eliminando ${row.nombre}:`, delErr.message);
                        }
                    }
                }
            }
        }
        if (cleaned > 0) console.log(`   🧹 ${cleaned} registros obsoletos eliminados`);
    }


    // Upsert en lotes
    let inserted = 0, updated = 0, skipped = 0;
    const uniqueRows = [...deduped.values()];
    const BATCH = 50;

    for (let i = 0; i < uniqueRows.length; i += BATCH) {
        const batch = uniqueRows.slice(i, i + BATCH).map(row => {
            const key = `${row.id_paciente}|${row.nombre}|${row.fecha_cirugia}`;
            const preserved = existingMap.get(key);
            return preserved ? { ...row, ...preserved } : row;
        });

        const { data, error } = await supabase
            .from('surgeries')
            .upsert(batch, { onConflict: 'id_paciente,nombre,fecha_cirugia', ignoreDuplicates: false })
            .select('id, created_at, updated_at');

        if (error) {
            console.error('   âŒ Batch error:', error.message);
            skipped += batch.length;
        } else if (data) {
            data.forEach(d => {
                d.created_at === d.updated_at ? inserted++ : updated++;
            });
        }
    }

    const summary = { total: result.recordset.length, inserted, updated, skipped };
    console.log(`   –… Cirugías: ${inserted} nuevos, ${updated} actualizados, ${skipped} errores`);
    return summary;
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// SYNC PRESUPUESTOS — SQL Server â†’ Supabase
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
async function syncPresupuestos(db, fastSync = false) {
    console.log(`💰 [2/7] Extrayendo presupuestos de SALUS... (fastSync: ${fastSync})`);
    const dateFilter = fastSync ? "fecha >= DATEADD(DAY, -30, CAST(GETDATE() AS DATE))" : "fecha >= '2026-01-01'";
    const result = await db.request().query(`
        SELECT idPresupuesto, idPaciente, Paciente, NHC, fecha, Observaciones,
               idArticulo, descripcion, cantidad, importeUnitario,
               [Importe Total Linea], [Importe Cobrado], Aceptado,
               FechaCaducidad, Presup_descripcion
        FROM VLISE_Presupuestos
        WHERE ${dateFilter}
    `);
    console.log(`   📥 ${result.recordset.length} filas extraídas`);

    // Agrupar por idPresupuesto
    const grouped = {};
    let skippedNoPatient = 0;

    for (const r of result.recordset) {
        if (!r.idPaciente) { skippedNoPatient++; continue; }
        if (!r.idPresupuesto) continue;

        const budgetKey = String(r.idPresupuesto);
        if (!grouped[budgetKey]) {
            grouped[budgetKey] = {
                id_presupuesto: parseInt(budgetKey, 10),
                id_paciente: String(r.idPaciente).trim(),
                nhc: r.NHC ? String(r.NHC).trim() : null,
                paciente: r.Paciente?.trim() || null,
                fecha: formatDate(r.fecha),
                observaciones: r.Observaciones?.trim() || null,
                aceptado: r.Aceptado ? String(r.Aceptado).trim().toLowerCase() : null,
                fecha_caducidad: formatDate(r.FechaCaducidad),
                presup_descripcion: r.Presup_descripcion?.trim() || null,
                items: [],
                lineCounter: 0,
            };
        }
        grouped[budgetKey].lineCounter++;
        grouped[budgetKey].items.push({
            id_presupuesto: parseInt(budgetKey, 10),
            linea: grouped[budgetKey].lineCounter,
            id_articulo: r.idArticulo ? String(r.idArticulo).trim() : `ITEM_${grouped[budgetKey].lineCounter}`,
            descripcion: r.descripcion?.trim() || null,
            cantidad: r.cantidad || 1,
            importe_unitario: Number(r.importeUnitario) || 0,
            importe_total: Number(r['Importe Total Linea']) || 0,
            importe_cobrado: Number(r['Importe Cobrado']) || 0,
        });
    }

    const presupuestos = Object.values(grouped).map(p => ({
        ...p,
        total_items: p.items.length,
        importe_total: p.items.reduce((s, i) => s + i.importe_total, 0),
        importe_cobrado: p.items.reduce((s, i) => s + i.importe_cobrado, 0),
    }));

    console.log(`   📦 ${presupuestos.length} presupuestos agrupados`);

    // Upsert cabeceras en lotes
    let insertedHeaders = 0;
    const BATCH = 500;
    for (let i = 0; i < presupuestos.length; i += BATCH) {
        const batch = presupuestos.slice(i, i + BATCH).map(({ items, lineCounter, ...header }) => header);
        const { data, error } = await supabase
            .from('presupuestos')
            .upsert(batch, { onConflict: 'id_presupuesto', ignoreDuplicates: false })
            .select('id_presupuesto');
        if (!error && data) insertedHeaders += data.length;
        else if (error) console.error('   â Œ Presupuesto header error:', error.message);
    }

    // Upsert ítems: limpiar y reinsertar
    let insertedItems = 0;
    const budgetIds = presupuestos.map(p => p.id_presupuesto);

    if (budgetIds.length > 0) {
        // Borrar ítems existentes para los presupuestos que se actualizan
        for (let i = 0; i < budgetIds.length; i += BATCH) {
            const batchIds = budgetIds.slice(i, i + BATCH);
            await supabase.from('presupuesto_items').delete().in('id_presupuesto', batchIds);
        }

        // Insertar todos los ítems
        const allItems = presupuestos.flatMap(p => p.items);
        for (let i = 0; i < allItems.length; i += BATCH) {
            const batch = allItems.slice(i, i + BATCH);
            const { data, error } = await supabase.from('presupuesto_items').insert(batch).select('id');
            if (!error && data) insertedItems += data.length;
            else if (error) console.error('   âŒ Presupuesto items error:', error.message);
        }
    }

    const summary = { total: result.recordset.length, presupuestos: presupuestos.length, headers: insertedHeaders, items: insertedItems, skippedNoPatient };
    console.log(`   –… Presupuestos: ${insertedHeaders} cabeceras, ${insertedItems} ítems`);
    return summary;
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// SYNC DEUDAS — SQL Server â†’ Supabase
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
async function syncDeudas(db, fastSync = false) {
    const syncStartTime = new Date().toISOString();
    console.log(`📊 [3/7] Extrayendo deudas de SALUS... (fastSync: ${fastSync})`);
    const req = db.request();
    req.timeout = 120000;
    const dateFilter = fastSync ? "T.[Fecha albaran] >= DATEADD(DAY, -30, CAST(GETDATE() AS DATE))" : "T.[Fecha albaran] >= '2025-05-01'";
    const result = await req.query(`
        SELECT
            T.[Fecha albaran], T.Paciente, T.Paciente_NHC, T.Paciente_NIF,
            T.Tarifa, T.Concepto, T.[Numero folio], T.[Cobrado linea],
            T.[Deuda linea], T.[Núm.Admisión], T.HOSP_Habitacion
        FROM [TABLEAU_Detalle de ventas Facturadas con Gastos y Honorarios] AS T
        WHERE T.Tarifa LIKE '042%'
          AND T.[Deuda linea] > 0
          AND T.Paciente IS NOT NULL
          AND ${dateFilter}
    `);
    console.log(`   📥 ${result.recordset.length} filas brutas extraídas`);

    // Filtrar folios B 00028 en JS para evitar bloqueo en vista de SALUS
    const matchingRows = result.recordset.filter(r => {
        const folio = r['Numero folio'] ? String(r['Numero folio']).trim() : '';
        return folio.startsWith('B 00028');
    });

    // Lookup teléfonos y mutua en VIS_Pacientes para solo los NHCs únicos
    const uniqueNhcs = [...new Set(matchingRows.map(r => r.Paciente_NHC ? String(r.Paciente_NHC).trim() : null).filter(Boolean))];
    const pacienteInfoMap = new Map();
    if (uniqueNhcs.length > 0) {
        const nhcList = uniqueNhcs.map(n => `'${n}'`).join(',');
        const pRes = await db.request().query(`
            SELECT NHC, telefono1, email, mutua
            FROM VIS_Pacientes
            WHERE NHC IN (${nhcList})
        `);
        for (const p of pRes.recordset) {
            const nhc = String(p.NHC).trim();
            const phone = normalizePhone(p.telefono1 ? String(p.telefono1) : '');
            pacienteInfoMap.set(nhc, {
                telefono: phone.normalized || '',
                telefono_original: phone.original || '',
                email: p.email ? String(p.email).trim() : null,
                mutua: p.mutua ? String(p.mutua).trim() : null,
            });
        }
    }

    // Agrupar por folio
    const facturasMap = new Map();
    for (const r of matchingRows) {
        const nhc = r.Paciente_NHC ? String(r.Paciente_NHC).trim() : '';
        const folio = r['Numero folio'] ? String(r['Numero folio']).trim() : '';
        if (!nhc || !folio) continue;

        const deuda = Number(r['Deuda linea']) || 0;
        const cobrado = Number(r['Cobrado linea']) || 0;

        const lineItem = {
            tarifa: String(r.Tarifa || '').trim(),
            concepto: String(r.Concepto || '').trim(),
            deuda, cobrado,
            fecha_albaran: formatDate(r['Fecha albaran']) || '',
            habitacion: String(r.HOSP_Habitacion || '').trim(),
            nAdmision: String(r['Núm.Admisión'] || '').trim(),
        };

        if (!facturasMap.has(folio)) {
            const info = pacienteInfoMap.get(nhc) || {};
            const tel = info.telefono || '';
            const telValido = tel.length === 13 && tel.startsWith('549');

            const dni = r.Paciente_NIF ? String(r.Paciente_NIF).trim() : null;
            facturasMap.set(folio, {
                nombre: r.Paciente, nhc, dni, folio, codigo: folio,
                telefono: tel, telefono_invalido: !telValido && tel !== '',
                obra_social: info.mutua || null,
                pendiente: deuda, cobrado, total: deuda + cobrado,
                lineas: [lineItem],
            });
        } else {
            const ex = facturasMap.get(folio);
            ex.pendiente += deuda;
            ex.cobrado += cobrado;
            ex.total += deuda + cobrado;
            ex.lineas.push(lineItem);
        }
    }

    // Filtrar facturas con deuda > $1
    const registros = [...facturasMap.values()].filter(f => f.pendiente > 1);
    console.log(`   📦 ${registros.length} facturas con deuda > $1`);

    // Procesar cada paciente (agrupado por NHC)
    const porNhc = {};
    for (const r of registros) {
        if (!porNhc[r.nhc]) {
            porNhc[r.nhc] = { nombre: r.nombre, dni: r.dni, obra_social: r.obra_social, facturas: [], telefono: r.telefono, telefono_invalido: r.telefono_invalido };
        } else if (!porNhc[r.nhc].telefono && r.telefono) {
            porNhc[r.nhc].telefono = r.telefono;
            porNhc[r.nhc].telefono_invalido = r.telefono_invalido;
        }
        porNhc[r.nhc].facturas.push(r);
    }

    // Prefetch de Supabase: pacientes existentes
    const nhcsToQuery = Object.keys(porNhc);
    const { data: existPacientes } = await supabase
        .from('deudas_pacientes')
        .select('id, nhc, telefono, categoria')
        .in('nhc', nhcsToQuery);
    const existPacientesMap = new Map((existPacientes || []).map(p => [p.nhc, p]));

    let pacientesNuevos = 0, pacientesActualizados = 0, filasImportadas = 0;
    const facturasToUpsert = [];

    for (const [nhc, grupo] of Object.entries(porNhc)) {
        const deudaTotal = grupo.facturas.reduce((s, f) => s + f.pendiente, 0);

        // Fecha más reciente
        let fechaMasReciente = null;
        for (const f of grupo.facturas) {
            for (const l of f.lineas) {
                if (l.fecha_albaran) {
                    const d = new Date(l.fecha_albaran);
                    if (!isNaN(d.getTime()) && (!fechaMasReciente || d > fechaMasReciente)) fechaMasReciente = d;
                }
            }
        }

        const existente = existPacientesMap.get(nhc);
        let pacienteId;
        if (existente) {
            const upd = {
                nombre: grupo.nombre,
                dni: grupo.dni || null,
                obra_social: grupo.obra_social || null,
                deuda_total: deudaTotal,
                cantidad_facturas: grupo.facturas.length,
                fecha_ultima_factura: fechaMasReciente?.toISOString() || null,
                updated_at: new Date().toISOString(),
            };
            
            let reactivado = false;
            if (existente.categoria === 'deuda_cancelada' && deudaTotal > 0) {
                upd.categoria = 'sin_gestionar';
                upd.deuda_cancelada_at = null;
                upd.deuda_cancelada_por = null;
                reactivado = true;
            }

            if (!existente.telefono && grupo.telefono) {
                upd.telefono = grupo.telefono;
                upd.telefono_invalido = grupo.telefono_invalido;
            }
            await supabase.from('deudas_pacientes').update(upd).eq('id', existente.id);
            pacienteId = existente.id;
            pacientesActualizados++;

            if (reactivado) {
                await supabase.from('deudas_seguimiento').insert({
                    paciente_id: existente.id,
                    usuario: 'Sistema',
                    descripcion: '⚠️ Paciente reingresa a gestión por nueva deuda sincronizada desde SALUS.',
                    tipo: 'cambio_categoria',
                });
            }
        } else {
            const { data: nuevo } = await supabase
                .from('deudas_pacientes')
                .insert({
                    nhc, nombre: grupo.nombre, dni: grupo.dni || null,
                    obra_social: grupo.obra_social || null,
                    deuda_total: deudaTotal,
                    cantidad_facturas: grupo.facturas.length,
                    telefono: grupo.telefono || null,
                    telefono_invalido: grupo.telefono_invalido || false,
                    fecha_ultima_factura: fechaMasReciente?.toISOString() || null,
                })
                .select('id').single();
            pacienteId = nuevo?.id;
            if (pacienteId) pacientesNuevos++;
        }

        // Preparar líneas de factura para batch upsert
        if (pacienteId) {
            for (const f of grupo.facturas) {
                for (let i = 0; i < f.lineas.length; i++) {
                    const linea = f.lineas[i];
                    const cod = f.lineas.length > 1 ? `${f.codigo}::${i}` : f.codigo;
                    facturasToUpsert.push({
                        paciente_id: pacienteId,
                        codigo: cod,
                        documento: f.folio, folio: f.folio,
                        total: (linea.deuda || 0) + (linea.cobrado || 0),
                        cobrado: linea.cobrado || 0,
                        pendiente: linea.deuda || 0,
                        servicio: linea.tarifa || null,
                        responsable: linea.concepto || null,
                        n_admision: linea.nAdmision || null,
                        fecha_hospitalizacion: linea.fecha_albaran || null,
                        tipo_hospitalizacion: linea.habitacion || null,
                        updated_at: new Date().toISOString(),
                    });
                }
            }
        }
    }

    // Batch upsert facturas (lotes de 500)
    const BATCH_FACTURAS = 500;
    for (let i = 0; i < facturasToUpsert.length; i += BATCH_FACTURAS) {
        const batch = facturasToUpsert.slice(i, i + BATCH_FACTURAS);
        const { error } = await supabase.from('deudas_facturas').upsert(batch, { onConflict: 'codigo' });
        if (!error) filasImportadas += batch.length;
        else console.error('Error upserting facturas batch:', error.message);
    }

    // ==========================================
    // LIMPIEZA DE FACTURAS PAGADAS/ANULADAS
    // ==========================================
    const cutoffDate = fastSync
        ? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        : new Date('2025-05-01T00:00:00Z');

    const { data: facturasHuerfanas } = await supabase
        .from('deudas_facturas')
        .select('id, paciente_id, fecha_hospitalizacion')
        .lt('updated_at', syncStartTime)
        .gt('pendiente', 0);

    let facturasLimpiadas = 0;
    if (facturasHuerfanas && facturasHuerfanas.length > 0) {
        const idsALimpiar = [];
        const pacientesAfectados = new Set();
        
        for (const f of facturasHuerfanas) {
            let entraEnRango = false;
            if (f.fecha_hospitalizacion) {
                const d = new Date(f.fecha_hospitalizacion);
                if (!isNaN(d.getTime()) && d >= cutoffDate) {
                    entraEnRango = true;
                }
            } else {
                if (!fastSync) entraEnRango = true;
            }
            
            if (entraEnRango) {
                idsALimpiar.push(f.id);
                pacientesAfectados.add(f.paciente_id);
            }
        }

        if (idsALimpiar.length > 0) {
            console.log(`   🧹 Limpiando ${idsALimpiar.length} facturas que ya no tienen deuda en SALUS...`);
            
            for (let i = 0; i < idsALimpiar.length; i += 500) {
                const batch = idsALimpiar.slice(i, i + 500);
                await supabase
                    .from('deudas_facturas')
                    .update({ pendiente: 0, updated_at: new Date().toISOString() })
                    .in('id', batch);
            }
                
            facturasLimpiadas = idsALimpiar.length;

            for (const pid of pacientesAfectados) {
                // 1. Obtener deuda anterior para el registro
                const { data: pacienteViejo } = await supabase
                    .from('deudas_pacientes')
                    .select('deuda_total, categoria')
                    .eq('id', pid)
                    .single();

                // 2. Calcular nueva deuda
                const { data: facturasActivas } = await supabase
                    .from('deudas_facturas')
                    .select('pendiente')
                    .eq('paciente_id', pid)
                    .gt('pendiente', 0);
                
                const nuevaDeudaTotal = (facturasActivas || []).reduce((s, f) => s + f.pendiente, 0);
                const nuevaCantidad = (facturasActivas || []).length;
                
                if (nuevaDeudaTotal === 0 && pacienteViejo && pacienteViejo.categoria !== 'deuda_cancelada') {
                    // Borrar al paciente si ya no tiene deuda en SALUS (excepto canceladas)
                    await supabase.from('deudas_pacientes').delete().eq('id', pid);
                    continue;
                }
                
                // Si aún queda deuda parcial, actualizar montos y registrar reducción
                const updPaciente = {
                    deuda_total: nuevaDeudaTotal,
                    cantidad_facturas: nuevaCantidad,
                    updated_at: new Date().toISOString()
                };
                
                const viejaDeuda = pacienteViejo?.deuda_total || 0;
                if (viejaDeuda > nuevaDeudaTotal) {
                    const reduccion = viejaDeuda - nuevaDeudaTotal;
                    const formateado = reduccion.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
                    await supabase.from('deudas_seguimiento').insert({
                        paciente_id: pid,
                        usuario: 'Sistema',
                        descripcion: `📉 Reducción parcial en SALUS. Se descontaron $${formateado} de facturas pagadas.`,
                        tipo: 'nota',
                    });
                }
                
                await supabase.from('deudas_pacientes').update(updPaciente).eq('id', pid);
            }
            console.log(`   ✨ Limpieza OK: ${pacientesAfectados.size} pacientes recalculados.`);
        }
    }

    // Registrar importación
    await supabase.from('deudas_importaciones').insert({
        archivo_nombre: 'SALUS Sync Automático',
        total_filas: result.recordset.length,
        filas_importadas: filasImportadas,
        filas_ignoradas: result.recordset.length - filasImportadas,
        pacientes_nuevos: pacientesNuevos,
        pacientes_actualizados: pacientesActualizados,
        usuario: 'SALUS Sync',
    });

    const summary = { total: result.recordset.length, pacientesNuevos, pacientesActualizados, filasImportadas };
    console.log(`   –… Deudas: ${pacientesNuevos} nuevos, ${pacientesActualizados} actualizados, ${filasImportadas} líneas`);
    return summary;
}

// ═══════════════════════════════════════════════════
// SYNC COBROS — SQL Server -> Supabase (BATCH)
// ═══════════════════════════════════════════════════
async function syncCobros(db, fastSync = false) {
    console.log(`💰 [3b/10] Extrayendo cobros de SALUS... (fastSync: ${fastSync})`);
    const req = db.request();
    req.timeout = 300000;
    const dateFilter = fastSync ? "t.[FechaCobro] >= DATEADD(DAY, -30, CAST(GETDATE() AS DATE))" : "t.[FechaCobro] >= '2025-01-01'";
    const result = await req.query(`
        SELECT t.[IdCobro], t.[nombre], t.[nombreFiscal], t.[NIF], t.[descripcion],
               t.[importe2], t.[comentario],
               CONVERT(VARCHAR(10), t.[fecha], 103) AS [fecha],
               t.[FechaCobro], t.[Entidad_telefono1], t.[Centro_Nombre],
               t.[Paciente], t.[Paciente_NHC], t.[FormaPago], t.[Caja],
               t.[Clasificacion], t.[UsuarioCobro]
          FROM [SALUS].[dbo].[PR_COBROS_QRY] AS t
          WHERE ${dateFilter}
          ORDER BY t.[fecha] DESC
    `);
    console.log('   ' + result.recordset.length + ' cobros extraidos');

    // Prefetch: NHC -> paciente_id (una sola query)
    const { data: allPacientes } = await supabase
        .from('deudas_pacientes').select('id, nhc');
    const nhcMap = {};
    for (const p of (allPacientes || [])) nhcMap[p.nhc] = p.id;

    // Preparar registros y acumular totales por NHC
    const porNhc = {};
    const rows = [];
    const now = new Date().toISOString();

    for (const r of result.recordset) {
        const nhc = r.Paciente_NHC ? String(r.Paciente_NHC).trim() : '';
        const idCobro = r.IdCobro ? String(r.IdCobro).trim() : '';
        if (!nhc || !idCobro) continue;

        const importe = Number(r.importe2) || 0;
        if (importe <= 0) continue;

        let fechaParsed = null;
        if (r.fecha) {
            const parts = String(r.fecha).split('/');
            if (parts.length === 3) fechaParsed = parts[2] + '-' + parts[1] + '-' + parts[0];
        }

        const pacienteId = nhcMap[nhc] || null;
        if (!porNhc[nhc]) porNhc[nhc] = { pacienteId, total: 0, count: 0 };
        porNhc[nhc].total += importe;
        porNhc[nhc].count++;

        rows.push({
            paciente_id: pacienteId, nhc, id_cobro: idCobro,
            nombre: r.nombre || null, nombre_fiscal: r.nombreFiscal || null,
            nif: r.NIF || null, descripcion: r.descripcion || null, importe,
            comentario: r.comentario || null, fecha: fechaParsed,
            fecha_cobro: r.FechaCobro || null, telefono: r.Entidad_telefono1 || null,
            centro: r.Centro_Nombre || null, paciente_nombre: r.Paciente || null,
            forma_pago: r.FormaPago || null, caja: r.Caja || null,
            clasificacion: r.Clasificacion || null, usuario_cobro: r.UsuarioCobro || null,
            updated_at: now,
        });
    }

    // Batch upsert en lotes de 500
    const BATCH = 500;
    let cobrosUpserted = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH);
        const { error } = await supabase.from('deudas_cobros')
            .upsert(batch, { onConflict: 'id_cobro' });
        if (!error) cobrosUpserted += batch.length;
        else console.error('   Error batch cobros ' + i + ': ' + error.message);
    }
    console.log('   ' + cobrosUpserted + '/' + rows.length + ' cobros upserted en ' + Math.ceil(rows.length / BATCH) + ' batches');

    // Actualizar totales por paciente
    let pacientesActualizados = 0;
    for (const [nhc, data] of Object.entries(porNhc)) {
        if (!data.pacienteId) continue;
        await supabase.from('deudas_pacientes').update({
            total_cobros: data.total, cantidad_cobros: data.count,
            updated_at: now,
        }).eq('id', data.pacienteId);
        pacientesActualizados++;
    }

    console.log('   Cobros OK: ' + pacientesActualizados + ' pacientes actualizados');
    return { total: result.recordset.length, cobrosUpserted, pacientesActualizados };
}

// ═══════════════════════════════════════════════════
// SYNC NOTAS DE CREDITO — SQL Server -> Supabase (BATCH)
// ═══════════════════════════════════════════════════
async function syncNotasCredito(db, fastSync = false) {
    console.log(`📝 [3c/10] Extrayendo notas de credito de SALUS... (fastSync: ${fastSync})`);
    const req = db.request();
    req.timeout = 300000;
    const dateFilter = fastSync ? "t.[fecha] >= DATEADD(DAY, -30, CAST(GETDATE() AS DATE))" : "t.[fecha] >= '2025-01-01'";
    const result = await req.query(`
        WITH FacturasUnicas AS (
            SELECT t.[id], t.[fecha] AS FechaOriginal,
                   CONVERT(VARCHAR(10), t.[fecha], 103) AS [fecha],
                   t.[Paciente_Nombre], t.[Paciente_NHC], t.[descripcion],
                   t.[idPaciente], t.[Centro_Alias], t.[Paciente_NIF], t.[NombreSerie],
                   CAST(ABS(t.[ImporteTotal]) AS FLOAT) AS [ImporteTotal],
                   ROW_NUMBER() OVER(PARTITION BY t.[id] ORDER BY t.[fecha] DESC) AS NumeroDeFila
              FROM [SALUS].[dbo].[PR_FACTURAS_QRY] AS t
              WHERE ${dateFilter}
                AND t.[NombreSerie] LIKE '%Nota Cr%dito%'
                AND t.[Paciente_Nombre] IS NOT NULL
        )
        SELECT [id],[fecha],[Paciente_Nombre],[Paciente_NHC],[descripcion],
               [idPaciente],[Centro_Alias],[Paciente_NIF],[NombreSerie],[ImporteTotal]
          FROM FacturasUnicas WHERE NumeroDeFila = 1
          ORDER BY FechaOriginal DESC
    `);
    console.log('   ' + result.recordset.length + ' notas de credito extraidas');

    // Prefetch: NHC -> paciente_id
    const { data: allPacientes } = await supabase
        .from('deudas_pacientes').select('id, nhc');
    const nhcMap = {};
    for (const p of (allPacientes || [])) nhcMap[p.nhc] = p.id;

    const porNhc = {};
    const rows = [];
    const now = new Date().toISOString();

    for (const r of result.recordset) {
        const nhc = r.Paciente_NHC ? String(r.Paciente_NHC).trim() : '';
        const idFactura = r.id ? String(r.id).trim() : '';
        if (!nhc || !idFactura) continue;

        const importe = Number(r.ImporteTotal) || 0;
        if (importe <= 0) continue;

        let fechaParsed = null;
        if (r.fecha) {
            const parts = String(r.fecha).split('/');
            if (parts.length === 3) fechaParsed = parts[2] + '-' + parts[1] + '-' + parts[0];
        }

        const pacienteId = nhcMap[nhc] || null;
        if (!porNhc[nhc]) porNhc[nhc] = { pacienteId, total: 0, count: 0 };
        porNhc[nhc].total += importe;
        porNhc[nhc].count++;

        rows.push({
            paciente_id: pacienteId, nhc, id_factura: idFactura,
            fecha: fechaParsed, paciente_nombre: r.Paciente_Nombre || null,
            descripcion: r.descripcion || null,
            id_paciente_salus: r.idPaciente ? String(r.idPaciente) : null,
            centro: r.Centro_Alias || null, nif: r.Paciente_NIF || null,
            nombre_serie: r.NombreSerie || null, importe_total: importe,
            updated_at: now,
        });
    }

    // Batch upsert en lotes de 500
    const BATCH = 500;
    let ncUpserted = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH);
        const { error } = await supabase.from('deudas_notas_credito')
            .upsert(batch, { onConflict: 'id_factura' });
        if (!error) ncUpserted += batch.length;
        else console.error('   Error batch NC ' + i + ': ' + error.message);
    }
    console.log('   ' + ncUpserted + '/' + rows.length + ' NC upserted en ' + Math.ceil(rows.length / BATCH) + ' batches');

    // Actualizar totales por paciente
    let pacientesActualizados = 0;
    for (const [nhc, data] of Object.entries(porNhc)) {
        if (!data.pacienteId) continue;
        await supabase.from('deudas_pacientes').update({
            total_notas_credito: data.total, cantidad_notas_credito: data.count,
            updated_at: now,
        }).eq('id', data.pacienteId);
        pacientesActualizados++;
    }

    console.log('   NC OK: ' + pacientesActualizados + ' pacientes actualizados');
    return { total: result.recordset.length, ncUpserted, pacientesActualizados };
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// SYNC ALTAS ADMINISTRATIVAS — SQL Server â†’ Supabase
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
async function syncAltasAdministrativas(db, fastSync = false) {
    console.log(`📋 [4/7] Extrayendo altas administrativas de SALUS... (fastSync: ${fastSync})`);

    const daysBack = fastSync ? 45 : 90;
    const openIngresoFilter = fastSync 
        ? "TA.[Fecha ingreso] >= DATEADD(DAY, -60, CAST(GETDATE() AS DATE))"
        : "TA.[Fecha ingreso] >= '2025-01-01'";

    const result = await db.request().query(`
        SELECT 
            TA.[Número admisión],
            TA.[Fecha ingreso],
            CAST(TA.[Fecha alta] AS DATE) AS [Fecha alta],
            TA.[Paciente],
            TA.[Cliente],
            TA.[Especialidad],
            TA.[Proceso],
            TA.[Doctor],
            TA.[Motivo de alta],
            TA.[Control ADM finalizado],
            (
                SELECT STUFF((
                    SELECT CHAR(13) + CHAR(10) + '---' + CHAR(13) + CHAR(10) + CAST(O.ValorM AS NVARCHAR(MAX))
                    FROM [PR InstRespHospi] O
                    WHERE O.idHospi = TA.idAdmision
                        AND O.activo = 1
                        AND O.ValorM IS NOT NULL
                        AND O.idPreguntaPr = 6175
                        AND LEN(LTRIM(RTRIM(CAST(O.ValorM AS NVARCHAR(MAX))))) > 0
                    FOR XML PATH(''), TYPE
                ).value('.', 'NVARCHAR(MAX)'), 1, 7, '')
            ) AS [Observaciones]
        FROM [SALUS].[dbo].[TABLEAU_Admisiones] TA
        WHERE 
            (
                TA.[Fecha ingreso] >= DATEADD(DAY, -${daysBack}, CAST(GETDATE() AS DATE))
                OR TA.[Fecha alta] >= DATEADD(DAY, -${daysBack}, CAST(GETDATE() AS DATE))
                OR (TA.[Fecha alta] IS NULL AND ${openIngresoFilter})
            )
            AND TA.[Fecha ingreso] < DATEADD(DAY, 1, CAST(GETDATE() AS DATE))
    `);
    console.log(`   📥 ${result.recordset.length} registros extraídos`);

    const records = [];
    for (const r of result.recordset) {
        const numAdmision = r['Número admisión'] ? String(r['Número admisión']).trim() : null;
        if (!numAdmision) continue;

        // Limpiar RTF de las observaciones si viene con formato
        const rawObs = r.Observaciones?.trim() || null;
        const cleanObs = rawObs ? stripRtf(rawObs) : null;

        // Si cliente no empieza con código de obra social (2-3 dígitos) o es nulo, es Particular (SALUS pone nombre del paciente)
        const rawCliente = r.Cliente?.trim() || null;
        const isParticular = !rawCliente || !/^\d{2,3}/.test(rawCliente) || rawCliente.includes('042') || rawCliente.toUpperCase().includes('PARTICULAR');
        const finalCliente = isParticular ? '042 - PARTICULARES' : rawCliente;

        records.push({
            numero_admision: numAdmision,
            paciente: r.Paciente?.trim() || 'Sin nombre',
            cliente: finalCliente,
            especialidad: r.Especialidad?.trim() || null,
            proceso: r.Proceso?.trim() || null,
            doctor: r.Doctor?.trim() || null,
            motivo_alta: r['Motivo de alta']?.trim() || null,
            control_adm_finalizado: r['Control ADM finalizado']?.trim() || null,
            observaciones: cleanObs,
            fecha_ingreso: formatDate(r['Fecha ingreso']),
            fecha_alta: formatDate(r['Fecha alta']),
            estado: isParticular ? 'Particular' : null,
        });
    }

    // Deduplicar por numero_admision (último gana)
    const deduped = new Map();
    for (const row of records) {
        deduped.set(row.numero_admision, row);
    }
    const uniqueRecords = [...deduped.values()];
    console.log(`   📦 ${uniqueRecords.length} registros únicos`);

    // Obtener estados existentes para preservarlos
    const ESTADO_FIELD = 'estado';
    const FIELDS_TO_PRESERVE = ['estado', 'operador', 'notas_internas', 'fecha_alta_adm'];
    const existingMap = new Map();

    const admNums = uniqueRecords.map(r => r.numero_admision);
    const FETCH_BATCH = 500;
    for (let i = 0; i < admNums.length; i += FETCH_BATCH) {
        const batch = admNums.slice(i, i + FETCH_BATCH);
        const { data: existing } = await supabase
            .from('altas_administrativas')
            .select(`numero_admision, ${FIELDS_TO_PRESERVE.join(', ')}, control_adm_finalizado`)
            .in('numero_admision', batch);

        if (existing) {
            for (const row of existing) {
                const preserved = {};
                for (const f of FIELDS_TO_PRESERVE) {
                    if (row[f] != null) {
                        // No preservar 'Procesada' — era el default viejo, ahora es null
                        if (f === 'estado' && row[f] === 'Procesada') continue;
                        preserved[f] = row[f];
                    }
                }
                // Guardar también el estado previo de control_adm para detectar transición
                preserved._prev_control_adm = row.control_adm_finalizado;
                if (Object.keys(preserved).length > 0) {
                    existingMap.set(row.numero_admision, preserved);
                }
            }
        }
    }
    console.log(`   🔒 ${existingMap.size} registros con estados a preservar`);

    // Upsert en lotes
    let inserted = 0, updated = 0, skipped = 0;
    const BATCH = 200;

    for (let i = 0; i < uniqueRecords.length; i += BATCH) {
        const batch = uniqueRecords.slice(i, i + BATCH).map(row => {
            const preserved = existingMap.get(row.numero_admision);
            const merged = preserved ? { ...row, ...preserved } : row;

            // Auto-mapear Particular si cliente es 042 - PARTICULARES o no empieza con número
            const isPart = !merged.cliente || !/^\d{2,3}/.test(merged.cliente.trim()) || merged.cliente.includes('042') || merged.cliente.toUpperCase().includes('PARTICULAR');
            if (isPart) {
                merged.cliente = '042 - PARTICULARES';
                if (!merged.estado) {
                    merged.estado = 'Particular';
                }
            }

            // Limpiar campo interno antes de enviar
            delete merged._prev_control_adm;

            // ── Detectar transición a "Alta Adm" para setear timestamp ──
            const prevControl = preserved?._prev_control_adm;
            const newControl = row.control_adm_finalizado;

            if (newControl === 'Sí' && !merged.fecha_alta_adm) {
                // Primera vez que control_adm_finalizado pasa a 'Sí' â†’ marcar timestamp
                merged.fecha_alta_adm = new Date().toISOString();
            }

            return merged;
        });

        const { data, error } = await supabase
            .from('altas_administrativas')
            .upsert(batch, { onConflict: 'numero_admision', ignoreDuplicates: false })
            .select('id, created_at, updated_at');

        if (error) {
            console.error('   âŒ Batch error:', error.message);
            skipped += batch.length;
        } else if (data) {
            data.forEach(d => {
                d.created_at === d.updated_at ? inserted++ : updated++;
            });
        }
    }

    const summary = { total: result.recordset.length, inserted, updated, skipped };
    console.log(`   –… Altas: ${inserted} nuevas, ${updated} actualizadas, ${skipped} errores`);
    return summary;
}

// ═══════════════════════════════════════════════════
// SYNC FOJA QUIRÚRGICA — SQL Server → Supabase
// Fuente: TABLEAU_FojaQuirurgica
// Extrae procedimientos quirúrgicos y calcula triage
// de facturación (Fácil/Media/Difícil) por admisión
// ═══════════════════════════════════════════════════
async function syncFojaQuirurgica(db, fastSync = false) {
    console.log(`🔪 [4a/10] Extrayendo foja quirúrgica de SALUS... (fastSync: ${fastSync})`);

    const dateClause = fastSync
        ? "[Fecha visita] >= CONVERT(VARCHAR(8), DATEADD(DAY, -15, GETDATE()), 112)"
        : "[Fecha visita] >= '20260401'";

    const result = await db.request().query(`
        SELECT 
            [Núm. Admisión],
            [idadmision],
            [Procedimiento quirúrgico],
            [Procedimiento quirúrgico 2],
            [Procedimiento quirúrgico 3],
            [Procedimiento quirúrgico 4]
        FROM [SALUS].[dbo].[TABLEAU_FojaQuirurgica]
        WHERE ${dateClause}
        ORDER BY [Fecha visita] DESC
    `);
    console.log(`   📥 ${result.recordset.length} registros de foja extraídos`);

    if (result.recordset.length === 0) {
        return { total: 0, actualizadas: 0, skipped: 0 };
    }

    // Agrupar por numero_admision (una admisión puede tener múltiples fojas)
    // Tomamos la unión de todos los procedimientos
    const fojaMap = new Map();
    for (const r of result.recordset) {
        const numAdm = r['Núm. Admisión'] ? String(r['Núm. Admisión']).trim() : null;
        if (!numAdm) continue;

        const procs = [
            r['Procedimiento quirúrgico'],
            r['Procedimiento quirúrgico 2'],
            r['Procedimiento quirúrgico 3'],
            r['Procedimiento quirúrgico 4'],
        ].filter(p => p && String(p).trim().length > 0)
         .map(p => String(p).trim());

        if (!fojaMap.has(numAdm)) {
            fojaMap.set(numAdm, new Set());
        }
        // Agregar procedimientos únicos
        for (const p of procs) {
            fojaMap.get(numAdm).add(p);
        }
    }

    console.log(`   📦 ${fojaMap.size} admisiones con foja quirúrgica`);

    // Calcular triage y actualizar altas_administrativas
    const entries = Array.from(fojaMap.entries());
    let actualizadas = 0, skipped = 0;
    const CHUNK = 50;

    for (let i = 0; i < entries.length; i += CHUNK) {
        const chunk = entries.slice(i, i + CHUNK);
        const promises = chunk.map(([numAdm, procsSet]) => {
            const procs = [...procsSet];
            return supabase
                .from('altas_administrativas')
                .update({
                    cantidad_procedimientos: procs.length,
                    procedimientos_detalle: procs,
                })
                .eq('numero_admision', numAdm);
        });

        const responses = await Promise.all(promises);
        for (const res of responses) {
            if (res.error) skipped++;
            else actualizadas++;
        }
    }

    const summary = { total: result.recordset.length, admisiones: fojaMap.size, actualizadas, skipped };
    console.log(`   ✅ Foja: ${actualizadas} altas enriquecidas con triage, ${skipped} errores`);
    return summary;
}

// ═══════════════════════════════════════════════════
// SYNC FACTURACIÓN INTERNADA — SQL Server → Supabase
// Fuente: TABLEAU_Detalle de ventas Facturadas con Gastos y Honorarios
// Filtra PDV 21 y 31 (facturación internada)
// Cruza con altas_administrativas por numero_admision
// ═══════════════════════════════════════════════════
async function syncFacturacionInternada(db, fastSync = false) {
    console.log(`🧾 [4b/10] Extrayendo facturación internada (PDV 21/31) de SALUS... (fastSync: ${fastSync})`);

    const daysBack = fastSync ? 45 : 90;
    const result = await db.request().query(`
        SELECT 
            [Fecha factura],
            [Fecha albaran],
            [Paciente],
            [Paciente_NHC],
            [Paciente_NIF],
            [Cliente],
            [Concepto],
            [Numero factura],
            [Nº Admision],
            [Usuario creación factura]
        FROM 
            [SALUS].[dbo].[TABLEAU_Detalle de ventas Facturadas con Gastos y Honorarios]
        WHERE 
            [Fecha albaran] >= DATEADD(DAY, -${daysBack}, CAST(GETDATE() AS DATE))
            AND [Nº Admision] IS NOT NULL
        ORDER BY 
            [Fecha albaran] ASC
    `);
    console.log(`   📥 ${result.recordset.length} líneas de facturación extraídas`);

    if (result.recordset.length === 0) {
        return { total: 0, upserted: 0, skipped: 0, altasActualizadas: 0 };
    }

    const records = [];
    for (const r of result.recordset) {
        const numAdmision = r['Nº Admision'] ? String(r['Nº Admision']).trim() : null;
        const numFactura = r['Numero factura'] ? String(r['Numero factura']).trim() : null;
        if (!numAdmision || !numFactura) continue;

        let pdv = null;
        if (numFactura.startsWith('00021') || numFactura.startsWith('21')) pdv = '21';
        else if (numFactura.startsWith('00031') || numFactura.startsWith('31')) pdv = '31';
        else continue;

        const concepto = r.Concepto ? String(r.Concepto).trim() : null;
        if (!concepto) continue;

        records.push({
            numero_admision: numAdmision,
            numero_factura: numFactura,
            fecha_factura: formatDate(r['Fecha factura'] || r['Fecha albaran']),
            paciente: r.Paciente?.trim() || null,
            paciente_nhc: r.Paciente_NHC ? String(r.Paciente_NHC).trim() : null,
            paciente_nif: r.Paciente_NIF ? String(r.Paciente_NIF).trim() : null,
            cliente: r.Cliente?.trim() || null,
            concepto,
            usuario_factura: r['Usuario creación factura']?.trim() || null,
            pdv,
        });
    }

    console.log(`   📦 ${records.length} registros válidos (PDV 21/31)`);

    // Deduplicar por clave única (numero_factura + numero_admision + concepto)
    const dedupMap = new Map();
    for (const r of records) {
        const key = `${r.numero_factura}|${r.numero_admision}|${r.concepto}`;
        dedupMap.set(key, r);
    }
    const dedupedRecords = [...dedupMap.values()];
    if (dedupedRecords.length < records.length) {
        console.log(`   🔄 Deduplicados: ${records.length} → ${dedupedRecords.length} (${records.length - dedupedRecords.length} duplicados removidos)`);
    }

    let upserted = 0, skipped = 0;
    const BATCH = 500;

    for (let i = 0; i < dedupedRecords.length; i += BATCH) {
        const batch = dedupedRecords.slice(i, i + BATCH);
        const { data, error } = await supabase
            .from('facturacion_internada')
            .upsert(batch, {
                onConflict: 'numero_factura,numero_admision,concepto',
                ignoreDuplicates: false,
            })
            .select('id');

        if (error) {
            console.error(`   ❌ Batch ${Math.floor(i / BATCH) + 1} error:`, error.message);
            skipped += batch.length;
        } else if (data) {
            upserted += data.length;
        }
    }

    console.log(`   ✅ Facturación internada: ${upserted} upserted, ${skipped} errores`);

    // ── Cruce automático con altas_administrativas ──
    const facturadoMap = new Map();
    for (const r of records) {
        if (!facturadoMap.has(r.numero_admision)) {
            facturadoMap.set(r.numero_admision, {
                facturas: new Set(),
                usuario: r.usuario_factura,
                fecha: r.fecha_factura,
            });
        }
        const entry = facturadoMap.get(r.numero_admision);
        entry.facturas.add(r.numero_factura);
        if (r.fecha_factura && (!entry.fecha || r.fecha_factura < entry.fecha)) {
            entry.fecha = r.fecha_factura;
        }
    }

    console.log(`   🔗 ${facturadoMap.size} admisiones con factura, cruzando con altas...`);

    const entries = [...facturadoMap.entries()];
    const CHUNK_SIZE = 50;
    let altasActualizadas = 0;
    for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
        const chunk = entries.slice(i, i + CHUNK_SIZE);
        await Promise.all(chunk.map(async ([numAdm, info]) => {
            const { error } = await supabase
                .from('altas_administrativas')
                .update({
                    facturada: true,
                    facturada_at: info.fecha ? new Date(info.fecha + 'T12:00:00').toISOString() : new Date().toISOString(),
                    usuario_facturo: info.usuario,
                    cantidad_facturas: info.facturas.size,
                })
                .eq('numero_admision', numAdm);
            if (!error) altasActualizadas++;
        }));
    }

    console.log(`   🔗 ${altasActualizadas} altas marcadas como facturadas`);
    return { total: result.recordset.length, upserted, skipped, altasActualizadas };
}


// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// SYNC FACTURACIÃ“N SEDE — SQL Server â†’ Supabase
// Fuente: PR_FACTURAS_QRY (dedup por idVisita)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
async function syncFacturacionSede(db) {
    console.log('💰 [5/7] Extrayendo facturación Sede Santa Fe de SALUS...');

    // Rango: mes en curso (formato seguro YYYYMMDD)
    const hoy = new Date();
    const y = hoy.getFullYear();
    const m = String(hoy.getMonth() + 1).padStart(2, '0');
    const primerDiaMes = `${y}${m}01`;
    const primerDiaMesFmt = `${y}-${m}-01`;

    const result = await db.request().query(`
        WITH Deduped AS (
            SELECT [idVisita], [Paciente_Nombre], [Paciente_NHC], [descripcion],
                   CAST([cantidad] AS INT) AS [cantidad],
                   CAST([importeUnitario] AS DECIMAL(18,2)) AS [ImporteUnitario],
                   CAST([ImporteTotal] AS DECIMAL(18,2)) AS [ImporteTotal],
                   [idPaciente], [Factura_FechaActualizacion],
                   CAST([Factura_FechaActualizacion] AS DATE) AS [Fecha],
                   CAST([Factura_FechaActualizacion] AS TIME(0)) AS [Hora],
                   [Centro_Alias], [Familia], [Servicio], [FormaDePago],
                   [Responsable], [Visita_TipoVisita], [Tarifa],
                   [UsuarioFactura], [Paciente_Telf1],
                   ROW_NUMBER() OVER(PARTITION BY [idVisita], [descripcion] ORDER BY [Factura_FechaActualizacion] DESC) as DupFila
            FROM [SALUS].[dbo].[PR_FACTURAS_QRY]
            WHERE [Factura_FechaActualizacion] >= '${primerDiaMes}'
              AND [Centro_Alias] = 'SANTA FE'
        )
        SELECT d.[idVisita], d.[Paciente_Nombre], d.[Paciente_NHC], d.[descripcion],
               d.[cantidad], d.[ImporteUnitario], d.[ImporteTotal],
               d.[idPaciente], d.[Fecha], d.[Hora],
               d.[Centro_Alias], d.[Familia], d.[Servicio], d.[FormaDePago],
               d.[Responsable], d.[Visita_TipoVisita], d.[Tarifa],
               d.[UsuarioFactura], d.[Paciente_Telf1]
        FROM Deduped d
        WHERE d.DupFila = 1
        ORDER BY d.[Fecha] DESC, d.[Hora] DESC
    `);
    console.log(`   📥 ${result.recordset.length} líneas extraídas (desde ${primerDiaMesFmt})`);

    if (result.recordset.length === 0) {
        return { total: 0, deleted: 0, inserted: 0, skipped: 0 };
    }

    // Transformar filas
    const records = [];
    for (const r of result.recordset) {
        const usuario = r.UsuarioFactura?.trim();
        if (!usuario) continue;

        const fecha = formatDate(r.Fecha);
        if (!fecha) continue;

        // Extraer hora y calcular turno
        let hora = null;
        let turno = null;
        if (r.Hora) {
            if (r.Hora instanceof Date) {
                const h = r.Hora.getUTCHours();
                const mn = r.Hora.getUTCMinutes();
                const s = r.Hora.getUTCSeconds();
                hora = `${String(h).padStart(2, '0')}:${String(mn).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
                turno = h < 15 ? 'mañana' : 'tarde';
            } else {
                const timeStr = String(r.Hora);
                const hMatch = timeStr.match(/(\d{1,2}):(\d{2})/);
                if (hMatch) {
                    hora = timeStr.substring(0, 8);
                    turno = parseInt(hMatch[1], 10) < 15 ? 'mañana' : 'tarde';
                }
            }
        }

        // ImporteTotal es el total de TODA la visita
        // Si hay N líneas en la visita, dividir el importe entre N
        // Usar importeUnitario (por práctica) en lugar de ImporteTotal (por visita)
        const importeLinea = Number(r.ImporteUnitario) || 0;

        records.push({
            id_visita: r.idVisita ? String(r.idVisita).trim() : null,
            id_paciente: r.idPaciente ? String(r.idPaciente).trim() : null,
            paciente: r.Paciente_Nombre?.trim() || null,
            paciente_nhc: r.Paciente_NHC ? String(r.Paciente_NHC).trim() : null,
            paciente_telefono: r.Paciente_Telf1 ? String(r.Paciente_Telf1).trim() : null,
            descripcion: r.descripcion?.trim() || null,
            cantidad: Number(r.cantidad) || 1,
            total_importe: importeLinea,
            fecha,
            hora,
            turno,
            familia: r.Familia?.trim() || null,
            servicio: r.Servicio?.trim() || null,
            forma_de_pago: r.FormaDePago?.trim() || null,
            responsable: r.Responsable?.trim() || null,
            visita_tipo: r.Visita_TipoVisita?.trim() || null,
            tarifa: r.Tarifa?.trim() || null,
            usuario_factura: usuario,
        });
    }

    console.log(`   📦 ${records.length} registros válidos`);

    // Estrategia: delete-insert (el mes completo)
    // Más confiable que upsert con idVisita que puede ser NULL
    const { error: delError } = await supabase
        .from('facturacion_sede')
        .delete()
        .gte('fecha', primerDiaMesFmt);

    if (delError) {
        console.error(`   âš ï¸ Error al limpiar mes:`, delError.message);
    } else {
        console.log(`   🖑ï¸ Datos del mes limpiados para refresh`);
    }

    // Insert en lotes
    let inserted = 0, skipped = 0;
    const BATCH = 100;

    for (let i = 0; i < records.length; i += BATCH) {
        const batch = records.slice(i, i + BATCH);
        const { data, error } = await supabase
            .from('facturacion_sede')
            .insert(batch)
            .select('id');

        if (error) {
            console.error(`   âŒ Batch ${Math.floor(i / BATCH) + 1} error:`, error.message);
            skipped += batch.length;
        } else if (data) {
            inserted += data.length;
        }
    }

    const summary = { total: result.recordset.length, deleted: 'mes completo', inserted, skipped };
    console.log(`   –… Facturación Sede: ${inserted} registros sincronizados, ${skipped} errores`);
    return summary;
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// SYNC VISITAS SEDE — SQL Server â†’ Supabase
// Fuente: VLISE_Visitas (Centro SANTA FE, Asistencia = Presente)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
async function syncVisitasSede(db) {
    console.log('🏥 [6/7] Extrayendo visitas Sede Santa Fe de SALUS...');

    // Rango: mes en curso
    const hoy = new Date();
    const y = hoy.getFullYear();
    const m = String(hoy.getMonth() + 1).padStart(2, '0');
    const primerDiaMes = `${y}${m}01`;
    const primerDiaMesFmt = `${y}-${m}-01`;

    const result = await db.request().query(`
        SELECT 
            v.[idVisita],
            CAST(v.[Fecha Visita] AS DATE) AS [Fecha],
            v.[IdPaciente],
            v.[Paciente],
            v.[Cliente],
            v.[Responsable],
            v.[Tipo Visita],
            v.[Centro],
            v.[Visita_Especialidad],
            LimpiezaUsuario.[UsuarioReal]
        FROM [SALUS].[dbo].[VLISE_Visitas] v
        OUTER APPLY (
            SELECT CAST('<x>' + 
                REPLACE(
                    REPLACE(
                        REPLACE(ISNULL(v.[UsuarioCita], ''), '<', '&lt;'), 
                    '>', '&gt;'), 
                '|', '</x><x>') 
            + '</x>' AS XML) AS xmlData
        ) AS XmlConv
        OUTER APPLY (
            SELECT TOP 1 
                LTRIM(RTRIM(SUBSTRING(Node.Valor, 1, CHARINDEX('(', Node.Valor) - 1))) AS [UsuarioReal]
            FROM (
                SELECT Split.a.value('.', 'VARCHAR(MAX)') AS Valor
                FROM XmlConv.xmlData.nodes('/x') AS Split(a)
            ) AS Node
            WHERE 
                CHARINDEX('(', Node.Valor) > 0 
                AND LEN(Node.Valor) >= CHARINDEX('(', Node.Valor) + 19 
            ORDER BY 
                CASE 
                    WHEN ISDATE(SUBSTRING(Node.Valor, CHARINDEX('(', Node.Valor) + 1, 19)) = 1 
                    THEN CONVERT(DATETIME, SUBSTRING(Node.Valor, CHARINDEX('(', Node.Valor) + 1, 19), 103)
                    ELSE CAST('1900-01-01' AS DATETIME) 
                END DESC
        ) AS LimpiezaUsuario
        WHERE 
            CAST(v.[Fecha Visita] AS DATE) >= '${primerDiaMes}'
            AND v.[Asistencia] = 'Presente'
            AND v.[Centro] = 'SANTA FE'
        ORDER BY v.[Fecha Visita] DESC
    `);
    console.log(`   📥 ${result.recordset.length} visitas extraídas (desde ${primerDiaMesFmt})`);

    if (result.recordset.length === 0) {
        return { total: 0, deleted: 0, inserted: 0, skipped: 0 };
    }

    // Transformar filas — el SQL ya devuelve UsuarioReal limpio via XML splitting
    const records = [];
    for (const r of result.recordset) {
        const usuario = r.UsuarioReal?.trim();
        if (!usuario) continue;

        const fecha = formatDate(r.Fecha);
        if (!fecha) continue;

        records.push({
            id_visita: r.idVisita ? String(r.idVisita).trim() : null,
            fecha,
            id_paciente: r.IdPaciente ? String(r.IdPaciente).trim() : null,
            paciente: r.Paciente?.trim() || null,
            cliente: r.Cliente?.trim() || null,
            responsable: r.Responsable?.trim() || null,
            tipo_visita: r['Tipo Visita']?.trim() || null,
            especialidad: r.Visita_Especialidad?.trim() || null,
            usuario_creacion: usuario,
            centro: 'SANTA FE',
        });
    }

    console.log(`   📦 ${records.length} registros válidos`);

    // Estrategia: delete-insert (mes completo)
    const { error: delError } = await supabase
        .from('visitas_sede')
        .delete()
        .gte('fecha', primerDiaMesFmt);

    if (delError) {
        console.error(`   âš ï¸ Error al limpiar mes:`, delError.message);
    } else {
        console.log(`   🖑ï¸ Datos del mes limpiados para refresh`);
    }

    // Insert en lotes
    let inserted = 0, skipped = 0;
    const BATCH = 500;

    for (let i = 0; i < records.length; i += BATCH) {
        const batch = records.slice(i, i + BATCH);
        const { data, error } = await supabase
            .from('visitas_sede')
            .insert(batch)
            .select('id');

        if (error) {
            console.error(`   âŒ Batch ${Math.floor(i / BATCH) + 1} error:`, error.message);
            skipped += batch.length;
        } else if (data) {
            inserted += data.length;
        }
    }

    const summary = { total: result.recordset.length, deleted: 'mes completo', inserted, skipped };
    console.log(`   –… Visitas Sede: ${inserted} registros sincronizados, ${skipped} errores`);
    return summary;
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ═══════════════════════════════════════════════════
// SYNC CIRUGÍAS ASOCIACIONES — SQL Server → Supabase
// Fuente: TABLEAU_Cirugias (especialidades con asociación)
// ═══════════════════════════════════════════════════
const ESPECIALIDAD_ASOCIACION = {
    'CIRUGIA': 'Asociación de Cirujanos',
    'GINECOLOGIA': 'Asociación de Ginecólogos',
    'ORTOPEDIA / TRAUMATOLOGIA': 'Asociación de Traumatólogos',
    'CIRUGIA PEDIATRICA': 'Asociación de Cirujanos Pediatras',
    'PEDIATRIA': 'Asociación de Cirujanos Pediatras',
    'OTORRINOLARINGOLOGIA': 'ORL (Particular)',
};

async function syncAsociacionesCirugias(db, fastSync = false) {
    console.log(`📦 [7/7] Extrayendo cirugías para asociaciones de SALUS... (fastSync: ${fastSync})`);

    const dateFilter = fastSync
        ? "CONVERT(DATE, LEFT([Fecha realización], 10), 103) >= DATEADD(DAY, -15, CAST(GETDATE() AS DATE))"
        : "CONVERT(DATE, LEFT([Fecha realización], 10), 103) >= '20260301'";

    const result = await db.request().query(`
        SELECT 
            CONVERT(VARCHAR(10), CONVERT(DATE, LEFT([Fecha realización], 10), 103), 23) AS [Fecha realización],
            [Nombre Paciente],
            [Cliente],
            [DNI],
            [Especialidad],
            [Nombre cirugía],
            [Estado],
            [Cirujano]
        FROM [SALUS].[dbo].[TABLEAU_Cirugias]
        WHERE 
            [Fecha realización] IS NOT NULL
            AND LEN([Fecha realización]) >= 10 
            AND ${dateFilter}
            AND [Especialidad] IN (
                'CIRUGIA', 
                'GASTROENTEROLOGIA',
                'OTORRINOLARINGOLOGIA', 
                'CIRUGIA PEDIATRICA', 
                'ORTOPEDIA / TRAUMATOLOGIA',
                'GINECOLOGIA'
            )
            AND [Estado] IN (
                'Presente', 
                'NO PROGRAMADA', 
                'No Programada',
                'URGENCIA',
                'Urgencia',
                'Realizada',
                'REALIZADA',
                'REALIZADO',
                'Realizado',
                'FINALIZADO',
                'Finalizada',
                'Finalizado'
            )
        ORDER BY CONVERT(DATE, LEFT([Fecha realización], 10), 103) ASC
    `);
    console.log(`   📥 ${result.recordset.length} registros extraídos`);

    const pediatriaDateFilter = fastSync
        ? "CAST([Fecha Visita] AS DATE) >= DATEADD(DAY, -15, CAST(GETDATE() AS DATE))"
        : "CAST([Fecha Visita] AS DATE) >= '2026-05-01'";

    const resultPediatria = await db.request().query(`
        SELECT 
            CAST([Fecha Visita] AS DATE) AS [Fecha realización],
            [Paciente] AS [Nombre Paciente],
            [Cliente] AS [Cliente],
            [NIF] AS [DNI],
            [Visita_Especialidad] AS [Especialidad],
            [Tipo Visita] AS [Nombre cirugía],
            [Asistencia] AS [Estado],
            [Responsable] AS [Cirujano]
        FROM [SALUS].[dbo].[VLISE_Visitas]
        WHERE 
            [Tipo Visita] = '(cx) sutura de herida'
            AND [Visita_Especialidad] IN ('CIRUGIA PEDIATRICA', 'PEDIATRIA')
            AND [Asistencia] = 'Presente'
            AND ${pediatriaDateFilter}
    `);
    console.log(`   📥 ${resultPediatria.recordset.length} registros pediátricos (suturas) extraídos`);

    const combinedRecords = [...result.recordset, ...resultPediatria.recordset];

    if (combinedRecords.length === 0) {
        return { total: 0, inserted: 0, updated: 0, skipped: 0 };
    }

    // Campos a preservar durante upsert (estados manuales del frontend)
    const FIELDS_TO_PRESERVE = [
        'docs_completos', 'en_carrito', 'constancia_id',
        'operador', 'checked_at', 'entregado_at',
    ];

    // Transformar filas
    const records = [];
    let skippedSinNombre = 0;
    let skippedFecha = 0;
    const skippedEspecialidades = new Map(); // especialidad → count

    for (const r of combinedRecords) {
        const nombre = r['Nombre Paciente']?.trim();
        const especialidad = r.Especialidad?.trim();
        if (!nombre || !especialidad) { skippedSinNombre++; continue; }

        const asociacion = ESPECIALIDAD_ASOCIACION[especialidad];
        if (!asociacion) {
            skippedEspecialidades.set(especialidad, (skippedEspecialidades.get(especialidad) || 0) + 1);
            continue;
        }

        const fechaRaw = r['Fecha realización'];
        const fecha = formatDate(fechaRaw);
        if (!fecha) { skippedFecha++; continue; }

        records.push({
            fecha_realizacion: fecha,
            nombre_paciente: nombre,
            cliente: r.Cliente?.trim() || null,
            dni: r.DNI ? String(r.DNI).trim() : null,
            especialidad,
            nombre_cirugia: r['Nombre cirugía']?.trim() || null,
            estado: r.Estado?.trim() || null,
            cirujano: r.Cirujano?.trim() || null,
            asociacion,
        });
    }

    // Log de exclusiones
    const totalExcluidos = skippedSinNombre + skippedFecha + [...skippedEspecialidades.values()].reduce((a, b) => a + b, 0);
    if (totalExcluidos > 0) {
        console.log(`   ⚠️  ${totalExcluidos} registros excluidos:`);
        if (skippedSinNombre > 0) console.log(`      - Sin nombre/especialidad: ${skippedSinNombre}`);
        if (skippedFecha > 0) console.log(`      - Fecha inválida: ${skippedFecha}`);
        if (skippedEspecialidades.size > 0) {
            console.log(`      - Especialidad no mapeada:`);
            for (const [esp, cnt] of skippedEspecialidades.entries()) {
                console.log(`        • "${esp}": ${cnt} registros`);
            }
        }
    }

    // Deduplicar (último gana por key: fecha+nombre_paciente+cirugia)
    const makeKey = (f, n, c) => `${f}|${(n || '').replace(/\s+/g, ' ').trim()}|${(c || '').replace(/\s+/g, ' ').trim()}`;

    // IMPORTANTE: usar nombre_paciente en vez de dni porque dni puede ser NULL
    // y en PostgreSQL NULL != NULL en constraints UNIQUE
    const deduped = new Map();
    for (const row of records) {
        const key = makeKey(row.fecha_realizacion, row.nombre_paciente, row.nombre_cirugia);
        deduped.set(key, row);
    }
    const uniqueRecords = [...deduped.values()];
    console.log(`   📦 ${uniqueRecords.length} registros únicos`);

    // Obtener estados existentes para preservarlos
    const existingMap = new Map();
    const FETCH_BATCH_SIZE = 500;

    const fechas = [...new Set(uniqueRecords.map(r => r.fecha_realizacion))];
    for (let i = 0; i < fechas.length; i += FETCH_BATCH_SIZE) {
        const batchFechas = fechas.slice(i, i + FETCH_BATCH_SIZE);
        const { data: existing } = await supabase
            .from('asociaciones_cirugias')
            .select(`fecha_realizacion, nombre_paciente, nombre_cirugia, ${FIELDS_TO_PRESERVE.join(', ')}`)
            .in('fecha_realizacion', batchFechas);

        if (existing) {
            for (const row of existing) {
                const key = makeKey(row.fecha_realizacion, row.nombre_paciente, row.nombre_cirugia);
                const preserved = {};
                for (const f of FIELDS_TO_PRESERVE) {
                    if (row[f] != null) preserved[f] = row[f];
                }
                if (Object.keys(preserved).length > 0) existingMap.set(key, preserved);
            }
        }
    }
    console.log(`   🔒 ${existingMap.size} registros con estados a preservar`);

    // Upsert en lotes
    let inserted = 0, updated = 0, skipped = 0;
    const BATCH = 200;

    for (let i = 0; i < uniqueRecords.length; i += BATCH) {
        const batch = uniqueRecords.slice(i, i + BATCH).map(row => {
            const key = makeKey(row.fecha_realizacion, row.nombre_paciente, row.nombre_cirugia);
            const preserved = existingMap.get(key);
            return preserved ? { ...row, ...preserved } : row;
        });

        const { data, error } = await supabase
            .from('asociaciones_cirugias')
            .upsert(batch, {
                onConflict: 'fecha_realizacion,nombre_paciente,nombre_cirugia',
                ignoreDuplicates: false,
            })
            .select('id, created_at, updated_at');

        if (error) {
            console.error('   ❌ Batch error:', error.message);
            skipped += batch.length;
        } else if (data) {
            data.forEach(d => {
                d.created_at === d.updated_at ? inserted++ : updated++;
            });
        }
    }

    const summary = { total: combinedRecords.length, inserted, updated, skipped };
    console.log(`   ✅ Asociaciones: ${inserted} nuevos, ${updated} actualizados, ${skipped} errores`);
    return summary;
}

// ═══════════════════════════════════════════════════
// SYNC LABORATORIOS (Anatomía Patológica) — SQL Server → Supabase
// ═══════════════════════════════════════════════════
async function syncLaboratorios(db, fastSync = false) {
    console.log(`🔬 [8/8] Extrayendo laboratorios de anatomía patológica de SALUS... (fastSync: ${fastSync})`);

    const dateFilter = fastSync
        ? "AP.[Fecha visita] >= CONVERT(VARCHAR(8), DATEADD(DAY, -15, GETDATE()), 112)"
        : "AP.[Fecha visita] >= '20260301'";

    const result = await db.request().query(`
        SELECT 
              AP.[idvisita]
              ,PP.[N.Admision]
              ,AP.[Fecha visita]
              ,AP.[Paciente]
              ,V.[NIF]
              ,V.[Cliente]
              ,AP.[Laboratorio]
              ,AP.[Biopsia por congelación]
              ,AP.[Biopsia simple]
              ,AP.[Material Remitido (Biopsia simple)]
              ,AP.[Biopsia ampliada]
              ,AP.[Material remitido (Biopsia ampliada)]
          FROM [SALUS].[dbo].[VLIS_AnatomiaPatologica] AS AP
          LEFT JOIN [SALUS].[dbo].[VLISE_Visitas] AS V 
              ON AP.[idvisita] = V.[idVisita]
          OUTER APPLY (
              SELECT TOP 1 PP_Sub.[N.Admision] 
              FROM [SALUS].[dbo].[VLISE_PeticionesPruebas] AS PP_Sub
              WHERE PP_Sub.[idVisita] = AP.[idvisita]
                AND PP_Sub.[N.Admision] IS NOT NULL
          ) AS PP
          WHERE ${dateFilter}
          ORDER BY AP.[Fecha visita] DESC;
    `);
    console.log(`   📥 ${result.recordset.length} registros extraídos`);

    if (result.recordset.length === 0) {
        return { total: 0, inserted: 0, updated: 0, skipped: 0 };
    }

    // Campos a preservar durante upsert (estados manuales del frontend)
    const FIELDS_TO_PRESERVE = [
        'modulo_asignado', 'clasificado_at', 'clasificado_por'
    ];

    // Transformar filas
    const records = [];
    for (const r of result.recordset) {
        const idVisita = r.idvisita ? String(r.idvisita).trim() : null;
        if (!idVisita) continue;

        const fechaRaw = r['Fecha visita'];
        const fecha = formatDate(fechaRaw);
        if (!fecha) continue;

        records.push({
            id_visita: idVisita,
            n_admision: r['N.Admision'] ? String(r['N.Admision']).trim() : null,
            fecha_visita: fecha,
            paciente: r.Paciente ? String(r.Paciente).trim() : null,
            dni: r.NIF ? String(r.NIF).trim() : null,
            cliente: r.Cliente ? String(r.Cliente).trim() : null,
            laboratorio: r.Laboratorio ? String(r.Laboratorio).trim() : null,
            biopsia_congelacion: r['Biopsia por congelación'] ? String(r['Biopsia por congelación']).trim() : null,
            biopsia_simple: r['Biopsia simple'] ? String(r['Biopsia simple']).trim() : null,
            material_biopsia_simple: r['Material Remitido (Biopsia simple)'] ? String(r['Material Remitido (Biopsia simple)']).trim() : null,
            biopsia_ampliada: r['Biopsia ampliada'] ? String(r['Biopsia ampliada']).trim() : null,
            material_biopsia_ampliada: r['Material remitido (Biopsia ampliada)'] ? String(r['Material remitido (Biopsia ampliada)']).trim() : null,
        });
    }

    // Deduplicar (último gana por key: id_visita)
    const deduped = new Map();
    for (const row of records) {
        deduped.set(row.id_visita, row);
    }
    const uniqueRecords = [...deduped.values()];
    console.log(`   📦 ${uniqueRecords.length} registros únicos`);

    // Obtener estados existentes para preservarlos
    const existingMap = new Map();
    const FETCH_BATCH_SIZE = 200;

    const ids = uniqueRecords.map(r => r.id_visita);
    const FETCH_BATCH_SIZE_LABS = 500;
    for (let i = 0; i < ids.length; i += FETCH_BATCH_SIZE_LABS) {
        const batchIds = ids.slice(i, i + FETCH_BATCH_SIZE);
        const { data: existing } = await supabase
            .from('laboratorios_anatomia_patologica')
            .select(`id_visita, ${FIELDS_TO_PRESERVE.join(', ')}`)
            .in('id_visita', batchIds);

        if (existing) {
            for (const row of existing) {
                const preserved = {};
                for (const f of FIELDS_TO_PRESERVE) {
                    if (row[f] != null) preserved[f] = row[f];
                }
                if (Object.keys(preserved).length > 0) existingMap.set(row.id_visita, preserved);
            }
        }
    }
    console.log(`   🔒 ${existingMap.size} registros con estados a preservar`);

    // Upsert en lotes
    let inserted = 0, updated = 0, skipped = 0;
    const BATCH = 200;

    for (let i = 0; i < uniqueRecords.length; i += BATCH) {
        const batch = uniqueRecords.slice(i, i + BATCH).map(row => {
            const preserved = existingMap.get(row.id_visita);
            return preserved ? { ...row, ...preserved } : row;
        });

        const { data, error } = await supabase
            .from('laboratorios_anatomia_patologica')
            .upsert(batch, {
                onConflict: 'id_visita',
                ignoreDuplicates: false,
            })
            .select('id, created_at, updated_at');

        if (error) {
            console.error('   ❌ Batch error:', error.message);
            skipped += batch.length;
        } else if (data) {
            data.forEach(d => {
                d.created_at === d.updated_at ? inserted++ : updated++;
            });
        }
    }

    const summary = { total: result.recordset.length, inserted, updated, skipped };
    console.log(`   ✅ Laboratorios: ${inserted} nuevos, ${updated} actualizados, ${skipped} errores`);
    return summary;
}

// ═══════════════════════════════════════════════
// SYNC CONSULTAS GUARDIA — SQL Server → Supabase
// Fuente: VLISE_Visitas con categoria (mes en curso dinámico)
// ═══════════════════════════════════════════════
async function syncConsultasGuardia(db, targetMonthStr = null) {
    console.log('\n\ud83c\udfe5 [CONSULTAS] Extrayendo consultas de guardia de SALUS...');

    let y, m;
    if (targetMonthStr) {
        [y, m] = targetMonthStr.split('-');
        y = parseInt(y, 10);
        m = m.padStart(2, '0');
    } else {
        const hoy = new Date();
        y = hoy.getFullYear();
        m = String(hoy.getMonth() + 1).padStart(2, '0');
    }
    const primerDia = `${y}${m}01`;
    // Primer día del próximo mes
    const currentMonthNum = parseInt(m, 10);
    const nextMonth = currentMonthNum + 1 > 12 ? 1 : currentMonthNum + 1;
    const nextYear = nextMonth === 1 ? y + 1 : y;
    const primerDiaSiguiente = `${nextYear}${String(nextMonth).padStart(2, '0')}01`;
    const mesPeriodo = `${y}-${m}`;

    console.log(`   \ud83d\udcc5 Rango: ${primerDia} a ${primerDiaSiguiente} (mes_periodo: ${mesPeriodo})`);

    const req = db.request();
    req.timeout = 120000;
    const result = await req.query(`
        WITH VisitasFiltradas AS (
            SELECT 
                [idVisita],
                [IdPaciente],
                [Cliente],
                [Asistencia],
                [Paciente],
                [NHC],
                [NIF],
                [Agenda],
                CASE 
                    WHEN [Agenda] LIKE '(NEO)%' THEN 'NEO'
                    WHEN [Agenda] LIKE 'GYM%' THEN 'GYM'
                    ELSE [Agenda] 
                END AS [Agrupacion_Agenda],
                [Grupo Agenda],
                [Tipo Visita],
                [TiempoPred],
                [Fecha Visita], 
                [Visita_Especialidad],
                [Hora Inicio Visita Formato Texto] AS [Hora_Visita],
                ROW_NUMBER() OVER(PARTITION BY [idVisita] ORDER BY [Fecha Visita] DESC) AS rn
            FROM [SALUS].[dbo].[VLISE_Visitas con categoria]
            WHERE 
                [Fecha Visita] >= '${primerDia}' 
                AND [Fecha Visita] < '${primerDiaSiguiente}'
                AND LOWER(LTRIM(RTRIM([Asistencia]))) = 'presente' 
                AND [Agenda] IN (
                    'GUARDIA CARDIOLOGICA', 'GUARDIAS CLINICA', 'GUARDIAS GINECOLOGIA', 'GUARDIAS PEDIATRÍA',
                    '(NEO) ROSALES TORRES SILVANA', '(NEO) CASTRO MONICA', '(NEO) VALDEZ MARIA', 
                    '(NEO) DRA. RUARTE, SONIA', '(NEO) DRA. SVRIZ WUCHERER NATALIA ELIZABETH', 
                    '(NEO) DRA. CLAVEL MARISA ANALIA', '(NEO) DR. HERNANDEZ, EDUARDO RAFAEL', 
                    '(NEO) GOMEZ ANDREA', '(NEO) HERNANDEZ, MARIA BELEN', '(NEO) DR. LUNA, HORACIO', 
                    '(NEO) JOFRE, GASTON MARCELO', '(NEO) DRA. CORREA, ANDREA', '(NEO) POSATINI MARIA FERNANDA', 
                    '(NEO) MORAN PATRICIA', '(NEO) MALOSCH, GABRIELA', '(NEO) TEJADA, JOSE LUIS', 
                    '(NEO) DR. RAMELLA, FERNANDO JOSE', '(NEO) DRA. AGUIRRE, VERONICA', 
                    '(NEO) DRA. CORREA, ANDREA-Baja', '(NEO) URIZAR ANALIA', '(NEO) AGUILAR, MARIA EUGENIA', 
                    '(NEO)URIZAR ANALIA', '(NEO) MOLINA, BERTHA BEATRIZ', '(NEO) DOMINGUEZ, GLADYS', 
                    '(NEO) DRA. MATEU MARTA EDITH', '(NEO) DR. FONT GERMAN ALBERTO ', 
                    '(NEO) MANRIQUE CLAUDIA', '(NEO)  DRA.RAMOS GABRIELA', '(NEO) MARTIN, AGUSTINA', 
                    'GYM PREPARTO', 'GYM BARIATRICA'
                )
        )
        SELECT 
            [idVisita],
            [IdPaciente],
            [Cliente],
            [Asistencia],
            [Paciente],
            [NHC],
            [NIF],
            [Agenda],             
            [Agrupacion_Agenda],  
            [Grupo Agenda],
            [Tipo Visita],
            [TiempoPred],
            [Fecha Visita],
            [Visita_Especialidad],
            [Hora_Visita]
        FROM 
            VisitasFiltradas
        WHERE 
            rn = 1
    `);
    console.log(`   \ud83d\udce5 ${result.recordset.length} registros extra\u00eddos`);

    if (result.recordset.length === 0) {
        return { total: 0, inserted: 0, updated: 0, skipped: 0, mesPeriodo };
    }

    // Crear/actualizar registro de importaci\u00f3n
    const { data: importRec } = await supabase
        .from('consultas_imports')
        .upsert({ mes: mesPeriodo, archivo: 'SALUS Sync Autom\u00e1tico', total_registros: result.recordset.length }, { onConflict: 'mes' })
        .select('id')
        .single();
    const importId = importRec?.id || null;

    // Transformar filas
    const records = [];
    for (const r of result.recordset) {
        const idVisita = r.idVisita ? Number(r.idVisita) : null;
        if (!idVisita) continue;

        const fecha = formatDate(r['Fecha Visita']);
        if (!fecha) continue;

        records.push({
            import_id: importId,
            id_visita: idVisita,
            id_paciente: r.IdPaciente ? Number(r.IdPaciente) : null,
            cliente: (r.Cliente || '').trim(),
            asistencia: (r.Asistencia || '').trim(),
            paciente: (r.Paciente || '').trim(),
            nhc: r.NHC || null,
            nif: r.NIF ? String(r.NIF).trim() : null,
            agenda: (r.Agenda || '').trim(),
            agrupacion_agenda: (r.Agrupacion_Agenda || '').trim(),
            grupo_agenda: (r['Grupo Agenda'] || '').trim(),
            tipo_visita: (r['Tipo Visita'] || '').trim(),
            tiempo_pred: r.TiempoPred || null,
            fecha_visita: fecha,
            hora_visita: (r.Hora_Visita || '').trim() || null,
            visita_especialidad: (r.Visita_Especialidad || '').trim(),
            mes_periodo: mesPeriodo,
        });
    }

    // Deduplicar por id_visita
    const deduped = new Map();
    for (const row of records) deduped.set(row.id_visita, row);
    const uniqueRecords = [...deduped.values()];
    console.log(`   \ud83d\udce6 ${uniqueRecords.length} registros \u00fanicos`);

    // Batch upsert
    let inserted = 0, updated = 0, skipped = 0;
    const BATCH = 500;

    for (let i = 0; i < uniqueRecords.length; i += BATCH) {
        const batch = uniqueRecords.slice(i, i + BATCH);
        const { data, error } = await supabase
            .from('consultas_guardia')
            .upsert(batch, { onConflict: 'id_visita', ignoreDuplicates: false })
            .select('id');

        if (error) {
            console.error(`   \u274c Batch ${i} error:`, error.message);
            skipped += batch.length;
        } else if (data) {
            inserted += data.length;
        }
    }

    // Actualizar total en import
    if (importId) {
        await supabase.from('consultas_imports').update({ total_registros: uniqueRecords.length }).eq('id', importId);
    }

    const summary = { total: result.recordset.length, inserted, updated, skipped, mesPeriodo };
    console.log(`   \u2705 Consultas Guardia: ${inserted} nuevas, ${updated} actualizadas, ${skipped} errores (${mesPeriodo})`);
    return summary;
}

// ═══════════════════════════════════════════════════
// SYNC RECEPCIONES VISITAS — SQL Server → Supabase
// Fuente: TABLEAU_Visitas ordenadas por agenda (CHQ + ECO)
// ═══════════════════════════════════════════════════
async function syncRecepcionesVisitas(db, fastSync = false) {
    console.log(`\n🏥 [RECEPCIONES] Extrayendo visitas CHQ/ECO de SALUS... (fastSync: ${fastSync})`);

    const daysBack = fastSync ? 7 : 30;
    const desde = new Date();
    desde.setDate(desde.getDate() - daysBack);
    const desdeStr = desde.toISOString().split('T')[0].replace(/-/g, '');

    const hastaClause = fastSync 
        ? "AND [FECHA] <= CONVERT(VARCHAR(8), DATEADD(DAY, 15, GETDATE()), 112)" 
        : "";

    const req = db.request();
    req.timeout = 120000;
    const result = await req.query(`
        SELECT 
              [TIPO AGENDA]
              ,[FECHA]
              ,[HORA]
              ,REPLACE(REPLACE([TIPO VISITA], CHAR(13), ' '), CHAR(10), ' ') AS [TIPO VISITA]
              ,[NHC]
              ,[NIF] AS [DNI]
              ,[PACIENTE]
              ,[CLIENTE] AS [Obra Social]
              ,REPLACE(REPLACE([MOTIVO], CHAR(13), ' '), CHAR(10), ' ') AS [MOTIVO]
              
              -- LÓGICA DE ASISTENCIA: si ayer y nula → Ausente
              ,CASE 
                  WHEN CAST([FECHA] AS DATE) = CAST(DATEADD(day, -1, GETDATE()) AS DATE) AND [ASISTENCIA] IS NULL THEN 'Ausente'
                  ELSE [ASISTENCIA] 
               END AS [ASISTENCIA]

              ,[MEDICO]
              ,[DIRECCION PACIENTE]
              ,[POBLACION PACIENTE] AS [Departamento]
              
              -- LIMPIEZA TELEFONO 1
              ,CASE 
                  WHEN NULLIF(LTRIM(RTRIM([TELEFONO1 PACIENTE])), '') IS NULL THEN [TELEFONO1 PACIENTE] 
                  WHEN [TELEFONO1 PACIENTE] LIKE '549%' THEN [TELEFONO1 PACIENTE] 
                  WHEN [TELEFONO1 PACIENTE] LIKE '15%' THEN STUFF([TELEFONO1 PACIENTE], 1, 2, '549264') 
                  ELSE '549' + [TELEFONO1 PACIENTE] 
               END AS [TELEFONO1 PACIENTE]
               
              -- LIMPIEZA TELEFONO 2
              ,CASE 
                  WHEN NULLIF(LTRIM(RTRIM([TELEFONO2 PACIENTE])), '') IS NULL THEN [TELEFONO2 PACIENTE] 
                  WHEN [TELEFONO2 PACIENTE] LIKE '549%' THEN [TELEFONO2 PACIENTE] 
                  WHEN [TELEFONO2 PACIENTE] LIKE '15%' THEN STUFF([TELEFONO2 PACIENTE], 1, 2, '549264') 
                  ELSE '549' + [TELEFONO2 PACIENTE] 
               END AS [TELEFONO2 PACIENTE]

              ,REPLACE(REPLACE([COMENTARIOS], CHAR(13), ' '), CHAR(10), ' ') AS [COMENTARIOS]
              ,[ESPECIALIDAD]
              ,[Centro]
          FROM [SALUS].[dbo].[TABLEAU_Visitas ordenadas por agenda]
          WHERE [FECHA] >= '${desdeStr}'
            ${hastaClause}
            AND (
                  [TIPO VISITA] LIKE '%(CHQ) CHEQUEO PREVENTIVO%' 
                  OR [TIPO VISITA] LIKE '%(ECO)%'
                );
    `);
    console.log(`   📥 ${result.recordset.length} registros extraídos (desde ${desdeStr})`);

    if (result.recordset.length === 0) {
        return { total: 0, inserted: 0, skipped: 0 };
    }

    // Transformar filas
    const records = [];
    for (const r of result.recordset) {
        const paciente = r.PACIENTE?.trim();
        if (!paciente) continue;

        const fecha = formatDate(r.FECHA);
        if (!fecha) continue;

        // Normalizar teléfonos (ya vienen limpios del SQL, pero aseguramos formato)
        const tel1Raw = r['TELEFONO1 PACIENTE'] ? String(r['TELEFONO1 PACIENTE']).replace(/\D/g, '') : null;
        const tel2Raw = r['TELEFONO2 PACIENTE'] ? String(r['TELEFONO2 PACIENTE']).replace(/\D/g, '') : null;

        // Extraer hora como string
        let hora = null;
        if (r.HORA) {
            if (r.HORA instanceof Date) {
                const h = r.HORA.getUTCHours();
                const mn = r.HORA.getUTCMinutes();
                hora = `${String(h).padStart(2, '0')}:${String(mn).padStart(2, '0')}`;
            } else {
                const timeStr = String(r.HORA);
                const hMatch = timeStr.match(/(\d{1,2}):(\d{2})/);
                if (hMatch) hora = `${hMatch[1].padStart(2, '0')}:${hMatch[2]}`;
            }
        }

        records.push({
            tipo_agenda: r['TIPO AGENDA']?.trim() || null,
            fecha,
            hora,
            tipo_visita: r['TIPO VISITA']?.trim() || null,
            nhc: r.NHC ? String(r.NHC).trim() : null,
            dni: r.DNI ? String(r.DNI).trim() : null,
            paciente,
            obra_social: r['Obra Social']?.trim() || null,
            motivo: r.MOTIVO?.trim() || null,
            asistencia: r.ASISTENCIA?.trim() || null,
            medico: r.MEDICO?.trim() || null,
            direccion: r['DIRECCION PACIENTE']?.trim() || null,
            departamento: r.Departamento?.trim() || null,
            telefono1: tel1Raw || null,
            telefono2: tel2Raw || null,
            comentarios: r.COMENTARIOS?.trim() || null,
            especialidad: r.ESPECIALIDAD?.trim() || null,
            centro: r.Centro?.trim() || null,
        });
    }

    console.log(`   📦 ${records.length} registros válidos`);

    // Estrategia: delete-insert para el rango de fechas activo
    // Detectar rango de fechas en los datos
    const fechas = [...new Set(records.map(r => r.fecha))].sort();
    const fechaMin = fechas[0];
    const fechaMax = fechas[fechas.length - 1];

    const { error: delError } = await supabase
        .from('recepciones_visitas')
        .delete()
        .gte('fecha', fechaMin)
        .lte('fecha', fechaMax);

    if (delError) {
        console.error(`   ⚠️ Error al limpiar rango:`, delError.message);
    } else {
        console.log(`   🗑️ Datos limpiados (${fechaMin} a ${fechaMax})`);
    }

    // Insert en lotes
    let inserted = 0, skipped = 0;
    const BATCH = 500;

    for (let i = 0; i < records.length; i += BATCH) {
        const batch = records.slice(i, i + BATCH);
        const { data, error } = await supabase
            .from('recepciones_visitas')
            .insert(batch)
            .select('id');

        if (error) {
            console.error(`   ❌ Batch ${Math.floor(i / BATCH) + 1} error:`, error.message);
            skipped += batch.length;
        } else if (data) {
            inserted += data.length;
        }
    }

    const summary = { total: result.recordset.length, inserted, skipped, fechaMin, fechaMax };
    console.log(`   ✅ Recepciones: ${inserted} registros sincronizados, ${skipped} errores (${fechaMin} a ${fechaMax})`);
    return summary;
}

// ENDPOINT PRINCIPAL: SYNC TODO
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ═══════════════════════════════════════════════════
// CÁLCULO DE TRIAGE AVANZADO
// Evalúa las reglas de facturación (Rojo > Amarillo > Verde)
// ═══════════════════════════════════════════════════
async function calcularTriageAvanzado() {
    console.log('\n🚦 [TRIAGE] Recalculando triage de facturación...');
    
    // Obtenemos todas las altas desde mayo 2026 (con paginación para evitar el límite de 1000)
    let altas = [];
    let from = 0;
    const step = 1000;
    let fetchMore = true;

    while (fetchMore) {
        const { data, error } = await supabase
            .from('altas_administrativas')
            .select('id, numero_admision, especialidad, doctor, fecha_ingreso, fecha_alta, cantidad_procedimientos, triage_facturacion')
            .gte('fecha_ingreso', '2026-05-01')
            .range(from, from + step - 1);

        if (error) {
            console.error('   ❌ Error obteniendo altas para triage:', error.message);
            return { error: error.message };
        }

        altas = altas.concat(data);
        if (data.length < step) {
            fetchMore = false;
        } else {
            from += step;
        }
    }

    let actualizadas = 0;
    const batchUpdates = [];

    for (const alta of altas) {
        const esp = (alta.especialidad || '').toUpperCase();
        const doc = (alta.doctor || '').toUpperCase();
        const procs = alta.cantidad_procedimientos || 0;
        
        let diasInternacion = 0;
        if (alta.fecha_ingreso && alta.fecha_alta) {
            const a = new Date(alta.fecha_ingreso + 'T12:00:00');
            const b = new Date(alta.fecha_alta + 'T12:00:00');
            diasInternacion = Math.max(0, Math.round((b - a) / (1000 * 60 * 60 * 24)));
        }

        let nuevoTriage = 'Verde'; // Default

        // 🔴 Reglas ROJO
        const esTerapia = esp.includes('TERAPIA INTENSIVA');
        if (esp.includes('NEUROCIRUGIA') || esp.includes('NEUROCIRUGÍA')) {
            if (doc.includes('PONS')) nuevoTriage = 'Rojo';
        } else if (esp.includes('CARDIOVASCULAR')) {
            nuevoTriage = 'Rojo';
        } else if (esTerapia && diasInternacion > 20) {
            nuevoTriage = 'Rojo';
        } else if (esTerapia && procs >= 1) {
            nuevoTriage = 'Rojo';
        } else if (procs > 2) {
            nuevoTriage = 'Rojo';
        } 
        // 🟢 Regla Excepción GINECOLOGIA (prioridad sobre amarillo)
        else if ((esp.includes('GINECOLOGIA') || esp.includes('GINECOLOGÍA')) && procs <= 2) {
            nuevoTriage = 'Verde';
        }
        // 🟡 Reglas AMARILLO
        else if (esp.includes('HEMODINAMIA') || esp.includes('MAXILOFACIAL') || esp.includes('PLASTICA') || esp.includes('PLÁSTICA')) {
            nuevoTriage = 'Amarillo';
        } else if (esTerapia && diasInternacion >= 5 && diasInternacion <= 20) {
            nuevoTriage = 'Amarillo';
        } else if (procs === 1 || procs === 2) {
            nuevoTriage = 'Amarillo';
        }
        // 🟢 Reglas VERDE (resto cae por defecto en Verde, pero explicitamos por legibilidad)
        else if (esp.includes('CLINICA MEDICA') || esp.includes('CLÍNICA MÉDICA') || esp.includes('SHOCK ROOM')) {
            nuevoTriage = 'Verde';
        } else if (esTerapia && diasInternacion < 5) {
            nuevoTriage = 'Verde';
        }

        if (alta.triage_facturacion !== nuevoTriage) {
            batchUpdates.push({ id: alta.id, triage_facturacion: nuevoTriage });
        }
    }

    if (batchUpdates.length > 0) {
        console.log(`   🔄 Actualizando triage en ${batchUpdates.length} altas...`);
        const CHUNK = 25;
        for (let i = 0; i < batchUpdates.length; i += CHUNK) {
            const chunk = batchUpdates.slice(i, i + CHUNK);
            const promises = chunk.map(update =>
                supabase
                    .from('altas_administrativas')
                    .update({ triage_facturacion: update.triage_facturacion })
                    .eq('id', update.id)
            );
            const responses = await Promise.all(promises);
            for (const res of responses) {
                if (res.error) {
                    console.error(`   ❌ Error update triage:`, res.error.message);
                } else {
                    actualizadas++;
                }
            }
        }
    }

    console.log(`   ✅ Triage avanzado calculado: ${actualizadas} altas actualizadas`);
    return { actualizadas };
}

let syncInProgress = false;

app.get('/api/salus/sync-all', async (req, res) => {
    if (syncInProgress) {
        return res.status(429).json({ success: false, error: 'Ya hay una sincronización en curso. Espere a que termine.' });
    }

    syncInProgress = true;
    const fastSync = req.query.fast === 'true';
    const startTime = Date.now();
    console.log(`\n🚀 ▬▬▬ SINCRONIZACIÓN COMPLETA INICIADA (FastSync: ${fastSync}) ▬▬▬ `);

    const results = {};

    try {
        const getDb = async () => await getPool();

        try {
            results.cirugias = await syncCirugias(await getDb());
        } catch (err) {
            console.error('âŒ Error en cirugías:', err.message);
            results.cirugias = { error: err.message };
        }

        try {
            results.presupuestos = await syncPresupuestos(await getDb(), fastSync);
        } catch (err) {
            console.error('âŒ Error en presupuestos:', err.message);
            results.presupuestos = { error: err.message };
        }

        try {
            results.deudas = await syncDeudas(await getDb(), fastSync);
        } catch (err) {
            console.error('âŒ Error en deudas:', err.message);
            results.deudas = { error: err.message };
        }

        try {
            results.cobros = await syncCobros(await getDb(), fastSync);
        } catch (err) {
            console.error('Error en cobros:', err.message);
            results.cobros = { error: err.message };
        }

        try {
            results.notasCredito = await syncNotasCredito(await getDb(), fastSync);
        } catch (err) {
            console.error('Error en notas de credito:', err.message);
            results.notasCredito = { error: err.message };
        }

        try {
            results.altas = await syncAltasAdministrativas(await getDb(), fastSync);
        } catch (err) {
            console.error('❌ Error en altas administrativas:', err.message);
            results.altas = { error: err.message };
        }

        try {
            results.uci = await syncUci(await getDb(), fastSync);
        } catch (err) {
            console.error('❌ Error en UCI:', err.message);
            results.uci = { error: err.message };
        }

        try {
            results.fojaQuirurgica = await syncFojaQuirurgica(await getDb(), fastSync);
        } catch (err) {
            console.error('❌ Error en foja quirúrgica:', err.message);
            results.fojaQuirurgica = { error: err.message };
        }

        try {
            results.facturacionInternada = await syncFacturacionInternada(await getDb(), fastSync);
        } catch (err) {
            console.error('❌ Error en facturación internada:', err.message);
            results.facturacionInternada = { error: err.message };
        }

        try {
            results.facturacion = await syncFacturacionSede(await getDb());
        } catch (err) {
            console.error('❌ Error en facturación sede:', err.message);
            results.facturacion = { error: err.message };
        }

        try {
            results.visitas = await syncVisitasSede(await getDb());
        } catch (err) {
            console.error('❌ Error en visitas sede:', err.message);
            results.visitas = { error: err.message };
        }

        try {
            results.asociaciones = await syncAsociacionesCirugias(await getDb(), fastSync);
        } catch (err) {
            console.error('Error en asociaciones:', err.message);
            results.asociaciones = { error: err.message };
        }

        try {
            results.laboratorios = await syncLaboratorios(await getDb(), fastSync);
        } catch (err) {
            console.error('Error en laboratorios:', err.message);
            results.laboratorios = { error: err.message };
        }

        try {
            results.consultasGuardia = await syncConsultasGuardia(await getDb());
        } catch (err) {
            console.error('Error en consultas guardia:', err.message);
            results.consultasGuardia = { error: err.message };
        }

        try {
            results.recepciones = await syncRecepcionesVisitas(await getDb(), fastSync);
        } catch (err) {
            console.error('Error en recepciones:', err.message);
            results.recepciones = { error: err.message };
        }

        try {
            results.triage = await calcularTriageAvanzado();
        } catch (err) {
            console.error('❌ Error en cálculo de triage:', err.message);
            results.triage = { error: err.message };
        }

        try {
            results.censoCamas = await syncCensoCamas();
        } catch (err) {
            console.error('❌ Error en censo de camas:', err.message);
            results.censoCamas = { error: err.message };
        }

        try {
            const d15 = new Date();
            d15.setDate(d15.getDate() - 15);
            const dynamicDate = d15.toISOString().split('T')[0];
            const fromKine = fastSync ? dynamicDate : '2026-08-01';
            results.kinesiologiaUci = await syncKinesiologiaUci(fromKine);
        } catch (err) {
            console.error('❌ Error en kinesiología UCI:', err.message);
            results.kinesiologiaUci = { error: err.message };
        }

        try {
            const d15 = new Date();
            d15.setDate(d15.getDate() - 15);
            const dynamicDate = d15.toISOString().split('T')[0];
            const fromDiag = fastSync ? dynamicDate : '2026-02-01';
            results.diagnosticos = await syncDiagnosticos(fromDiag);
        } catch (err) {
            console.error('❌ Error en diagnósticos:', err.message);
            results.diagnosticos = { error: err.message };
        }

        try {
            console.log('🔄 [Turnos Online] Sincronizando alertas de turnos duplicados con SALUS...');
            results.turnosOnline = await syncTurnosOnlineToSupabase(await getDb(), { days: fastSync ? 2 : 4, supabaseClient: supabase });
        } catch (err) {
            console.error('❌ Error en sincronización de turnos online:', err.message);
            results.turnosOnline = { error: err.message };
        }

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`\n–… ▬▬▬▬▬ SINCRONIZACIÓN COMPLETADA en ${elapsed}s ▬▬▬▬▬ \n`);

        console.log(`
         ___  _____
       .'/,-Y"     "~-.
       l.Y             ^.
       /\\               _\\_
      i            ___/"   "\\
      |          /"   "\\   o !
      l         ]     o !__./
       \\ _  _    \\.___./    "~\\
        X \\/ \\            ___./
       ( \\ ___.   _..--~~"   ~\\\`-.
        \\\` Z,--   /               \\
          \\__.  (   /       ______)
            \\   l  /-----~~" /
             Y   \\          /
             |    "x______.^
             |           \\
             j            Y

    –¨ "Â¡Mmm... Deudas y Presupuestos frescos!" –¨
        `);

        res.json({
            success: true,
            elapsed: `${elapsed}s`,
            timestamp: new Date().toISOString(),
            results,
        });
    } catch (err) {
        console.error('âŒ Error fatal:', err.message);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        syncInProgress = false;
    }
});

// â”€â”€ Endpoints individuales â”€â”€
app.get('/api/salus/sync/uci', async (req, res) => {
    try { const db = await getPool(); res.json({ success: true, results: await syncUci(db, req.query.fast === 'true') }); }
    catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/salus/sync/altas', async (req, res) => {
    try { const db = await getPool(); res.json({ success: true, results: await syncAltasAdministrativas(db, req.query.fast === 'true') }); }
    catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/salus/sync/foja', async (req, res) => {
    try { const db = await getPool(); res.json({ success: true, results: await syncFojaQuirurgica(db, req.query.fast === 'true') }); }
    catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/salus/sync/cirugias', async (req, res) => {
    try { const db = await getPool(); res.json({ success: true, results: await syncCirugias(db) }); }
    catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/salus/sync/presupuestos', async (req, res) => {
    try { const db = await getPool(); res.json({ success: true, results: await syncPresupuestos(db, req.query.fast === 'true') }); }
    catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/salus/sync/deudas', async (req, res) => {
    try { const db = await getPool(); res.json({ success: true, results: await syncDeudas(db, req.query.fast === 'true') }); }
    catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/salus/sync/cobros', async (req, res) => {
    try { const db = await getPool(); res.json({ success: true, results: await syncCobros(db, req.query.fast === 'true') }); }
    catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/salus/sync/notas-credito', async (req, res) => {
    try { const db = await getPool(); res.json({ success: true, results: await syncNotasCredito(db, req.query.fast === 'true') }); }
    catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/salus/sync/facturacion', async (req, res) => {
    try { const db = await getPool(); res.json({ success: true, results: await syncFacturacionSede(db) }); }
    catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/salus/sync/visitas', async (req, res) => {
    try { const db = await getPool(); res.json({ success: true, results: await syncVisitasSede(db) }); }
    catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/salus/sync/asociaciones', async (req, res) => {
    try { const db = await getPool(); res.json({ success: true, results: await syncAsociacionesCirugias(db, req.query.fast === 'true') }); }
    catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/salus/sync/laboratorios', async (req, res) => {
    try { const db = await getPool(); res.json({ success: true, results: await syncLaboratorios(db, req.query.fast === 'true') }); }
    catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/salus/sync/consultas-guardia', async (req, res) => {
    try { const db = await getPool(); res.json({ success: true, results: await syncConsultasGuardia(db) }); }
    catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/salus/sync/consultas', async (req, res) => {
    try {
        const db = await getPool();
        const result = await syncConsultasGuardia(db, req.query.month);
        res.json({ success: true, data: result });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/salus/sync/recepciones', async (req, res) => {
    try { const db = await getPool(); res.json({ success: true, results: await syncRecepcionesVisitas(db, req.query.fast === 'true') }); }
    catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/salus/sync/facturacion-internada', async (req, res) => {
    try { const db = await getPool(); res.json({ success: true, results: await syncFacturacionInternada(db, req.query.fast === 'true') }); }
    catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/salus/sync/diagnosticos', async (req, res) => {
    try {
        const { syncDiagnosticos } = await import('./sync_diagnosticos.mjs');
        const fromDate = req.query.from || '2026-06-01';
        const result = await syncDiagnosticos(fromDate);
        res.json({ success: true, results: result });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/salus/sync/censo-camas', async (req, res) => {
    try {
        const result = await syncCensoCamas();
        res.json({ success: true, results: result });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/salus/sync/kinesiologia-uci', async (req, res) => {
    try {
        const fromDate = req.query.from || (req.query.fast === 'true' ? '2026-09-01' : '2026-08-01');
        const result = await syncKinesiologiaUci(fromDate);
        res.json({ success: true, results: result });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/salus/sync/pacientes', async (req, res) => {
    try {
        const days = req.query.days ? Number(req.query.days) : (req.query.fast === 'true' ? 7 : 30);
        const fromDate = req.query.from || (req.query.all === 'true' ? '2026-06-01' : null);
        const result = await syncPacientes({ days, fromDate, all: req.query.all === 'true' });
        res.json({ success: true, results: result });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/salus/sync/paciente/:ident', async (req, res) => {
    try {
        const result = await syncSinglePaciente(req.params.ident);
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// â”€â”€ Health check â”€â”€
app.get('/api/salus/health', async (req, res) => {
    try {
        const db = await getPool();
        await db.request().query('SELECT 1 AS ok');
        res.json({ success: true, connected: true, server: '128.223.16.29:2450', supabase: supabaseUrl ? 'configured' : 'missing' });
    } catch (err) {
        res.json({ success: false, connected: false, error: err.message });
    }
});

// ── Búsqueda de Paciente en Tiempo Real (Kiosco / Tótem / Contact Center) ──
app.get('/api/salus/paciente/:dni', async (req, res) => {
    try {
        const rawDni = String(req.params.dni || '').trim();
        const cleanDni = rawDni.replace(/\D/g, '');
        if (!cleanDni || cleanDni.length < 5) {
            return res.status(400).json({ success: false, error: 'DNI inválido' });
        }

        const db = await getPool();
        const result = await db.request()
            .input('dni', sql.VarChar(50), cleanDni)
            .query(`
                SELECT TOP 1
                    id,
                    nombre,
                    nombre1,
                    nombre2,
                    NIF,
                    NHC,
                    mutua,
                    telefono1,
                    FechaNacimiento,
                    DATEDIFF(hour, FechaNacimiento, GETDATE())/8766 AS edad
                FROM PR_FICHA_PACIENTE_QRY
                WHERE tipoEntidad = 1
                  AND (NIF = @dni OR NIF LIKE '%' + @dni)
            `);

        if (result.recordset && result.recordset.length > 0) {
            const p = result.recordset[0];
            const paciente = {
                id: p.id,
                id_paciente: p.id,
                nombre: p.nombre,
                nombre1: p.nombre1,
                nombre2: p.nombre2,
                dni: p.NIF,
                nhc: p.NHC,
                mutua: p.mutua,
                coseguro: p.mutua,
                telefono: p.telefono1,
                fecha_nacimiento: p.FechaNacimiento,
                edad: p.edad
            };

            // Cachear en Supabase hospital_pacientes en segundo plano
            try {
                await supabase.from('hospital_pacientes').upsert({
                    id_paciente: p.id,
                    nombre: p.nombre,
                    dni: cleanDni,
                    nhc: p.NHC,
                    telefono: p.telefono1,
                    coseguro: p.mutua,
                    fecha_nacimiento: p.FechaNacimiento,
                    edad: p.edad,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'id_paciente' });
            } catch (cacheErr) {
                console.warn('Error cacheando en hospital_pacientes:', cacheErr.message);
            }

            return res.json({ success: true, paciente });
        }

        return res.json({ success: true, paciente: null });
    } catch (err) {
        console.error('Error buscando paciente en SALUS:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── Búsqueda de Grupo Familiar por Teléfono en Tiempo Real (SALUS) ──
app.get('/api/salus/familiares/:telefono', async (req, res) => {
    try {
        const rawTel = String(req.params.telefono || '').trim();
        let cleanTel = rawTel.replace(/\D/g, '');
        if (cleanTel.startsWith('549')) cleanTel = cleanTel.slice(3);
        else if (cleanTel.startsWith('54')) cleanTel = cleanTel.slice(2);

        // Tomar los últimos 7 dígitos centrales para coincidencia de teléfono local (ej: 5095753)
        const coreTel = cleanTel.slice(-7);
        if (!coreTel || coreTel.length < 6) {
            return res.status(400).json({ success: false, error: 'Teléfono inválido' });
        }

        const db = await getPool();
        const result = await db.request()
            .input('tel', sql.VarChar(50), coreTel)
            .query(`
                SELECT 
                    id,
                    nombre,
                    nombre1,
                    nombre2,
                    NIF AS dni,
                    NHC AS nhc,
                    mutua AS coseguro,
                    telefono1 AS telefono,
                    telefono2,
                    FechaNacimiento,
                    DATEDIFF(hour, FechaNacimiento, GETDATE())/8766 AS edad
                FROM PR_FICHA_PACIENTE_QRY
                WHERE tipoEntidad = 1
                  AND (telefono1 LIKE '%' + @tel + '%' OR telefono2 LIKE '%' + @tel + '%')
                ORDER BY FechaNacimiento ASC
            `);

        if (result.recordset && result.recordset.length > 0) {
            const seen = new Set();
            const familiares = [];
            for (const p of result.recordset) {
                const key = p.dni || p.id;
                if (key && !seen.has(key)) {
                    seen.add(key);
                    familiares.push({
                        id_paciente: p.id,
                        nombre: p.nombre,
                        nombre1: p.nombre1,
                        nombre2: p.nombre2,
                        dni: p.dni,
                        nhc: p.nhc,
                        coseguro: p.coseguro,
                        telefono: p.telefono || p.telefono2,
                        fecha_nacimiento: p.FechaNacimiento,
                        edad: p.edad
                    });
                }
            }

            // Ordenar: primero adultos de 18+ (priorizando madres/adultos jóvenes sobre abuelos), luego menores de mayor a menor
            familiares.sort((a, b) => {
                const edadA = a.edad || 0;
                const edadB = b.edad || 0;
                const isAdultA = edadA >= 18;
                const isAdultB = edadB >= 18;
                if (isAdultA && !isAdultB) return -1;
                if (!isAdultA && isAdultB) return 1;
                if (isAdultA && isAdultB) return edadA - edadB; // Madre primero (ej 33 vs 55)
                return edadB - edadA; // Niños: 5 años antes que 1 año
            });

            // Auto-upsert de cada familiar en Supabase hospital_pacientes en segundo plano
            (async () => {
                for (const f of familiares) {
                    try {
                        await supabase.from('hospital_pacientes').upsert({
                            id_paciente: f.id_paciente,
                            nombre: f.nombre,
                            dni: f.dni,
                            nhc: f.nhc,
                            telefono: f.telefono,
                            coseguro: f.coseguro,
                            fecha_nacimiento: f.fecha_nacimiento,
                            edad: f.edad,
                            updated_at: new Date().toISOString()
                        }, { onConflict: 'id_paciente' });
                    } catch (e) {
                        console.warn('Cache familiar error:', e.message);
                    }
                }
            })().catch(() => {});

            return res.json({ success: true, familiares });
        }

        return res.json({ success: true, familiares: [] });
    } catch (err) {
        console.error('Error buscando familiares en SALUS:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Sincronización de notas diarias, honorarios y consultorios de prestadores para Contact Center
app.get('/api/contact-center/sync-doctor-parameters', async (req, res) => {
    try {
        console.log('🔄 Disparando sincronización de parámetros de médicos (Contact Center)...');
        const result = await syncDoctorParameters();
        res.json({ success: true, ...result });
    } catch (err) {
        console.error('Error sincronizando parámetros de médicos:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Limpieza de duplicados de asociaciones por fecha inconsistente
app.get('/api/salus/cleanup/asociaciones-dups', async (req, res) => {
    try {
        console.log('Buscando duplicados de asociaciones por fecha inconsistente...');

        const { data: all, error } = await supabase
            .from('asociaciones_cirugias')
            .select('id, fecha_realizacion, nombre_paciente, nombre_cirugia, dni, docs_completos, en_carrito, constancia_id, created_at')
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Agrupar por nombre_paciente + nombre_cirugia + dni (sin fecha)
        const groups = new Map();
        for (const row of all) {
            const key = `${(row.nombre_paciente || '').toUpperCase()}|${(row.nombre_cirugia || '').toUpperCase()}|${row.dni || ''}`;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(row);
        }

        // Detectar duplicados: mismo key con fechas donde dia y mes estan invertidos
        const toDelete = [];
        const dupsFound = [];

        for (const [key, rows] of groups) {
            if (rows.length < 2) continue;

            for (let i = 0; i < rows.length; i++) {
                for (let j = i + 1; j < rows.length; j++) {
                    const a = rows[i], b = rows[j];
                    const [aY, aM, aD] = (a.fecha_realizacion || '').split('-');
                    const [bY, bM, bD] = (b.fecha_realizacion || '').split('-');

                    // Verificar si las fechas son inversion de dia/mes
                    if (aY === bY && aM === bD && aD === bM && aM !== aD) {
                        const aHasWork = a.docs_completos || a.en_carrito || a.constancia_id;
                        const bHasWork = b.docs_completos || b.en_carrito || b.constancia_id;

                        let keep, remove;
                        if (aHasWork && !bHasWork) {
                            keep = a; remove = b;
                        } else if (bHasWork && !aHasWork) {
                            keep = b; remove = a;
                        } else {
                            keep = new Date(a.created_at) > new Date(b.created_at) ? a : b;
                            remove = keep === a ? b : a;
                        }

                        dupsFound.push({
                            paciente: a.nombre_paciente,
                            cirugia: a.nombre_cirugia,
                            fecha_keep: keep.fecha_realizacion,
                            fecha_remove: remove.fecha_realizacion,
                            id_keep: keep.id,
                            id_remove: remove.id,
                        });
                        toDelete.push(remove.id);
                    }
                }
            }
        }

        console.log(`   ${dupsFound.length} duplicados encontrados`);

        const execute = req.query.execute === 'true';
        let deleted = 0;

        if (execute && toDelete.length > 0) {
            const BATCH = 50;
            for (let i = 0; i < toDelete.length; i += BATCH) {
                const batch = toDelete.slice(i, i + BATCH);
                const { error: delErr } = await supabase
                    .from('asociaciones_cirugias')
                    .delete()
                    .in('id', batch);
                if (delErr) console.error('   Error borrando batch:', delErr.message);
                else deleted += batch.length;
            }
            console.log(`   ${deleted} duplicados eliminados`);
        }

        res.json({
            success: true,
            duplicates_found: dupsFound.length,
            details: dupsFound,
            deleted: execute ? deleted : 0,
            message: execute
                ? `${deleted} duplicados eliminados`
                : `${dupsFound.length} duplicados encontrados. Agrega ?execute=true para eliminarlos.`,
        });
    } catch (err) {
        console.error('Error limpiando duplicados:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// â”€â”€ Servidor â”€â”€
app.listen(PORT, '0.0.0.0', () => {
    console.log(`
â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—
â•‘  🏥 SALUS Sync Server — ADM-QUI                    â•‘
â•‘  Puerto: ${PORT}                                      â•‘
â•‘  SQL Server: 128.223.16.29:2450 (SALUS)            â•‘
â•‘  Supabase: ${supabaseUrl ? '–… Configurado' : 'âŒ FALTA'}                       â•‘
â•‘                                                    â•‘
â•‘  Endpoints:                                        â•‘
â•‘    GET /api/salus/sync-all    (todo de una vez)     â•‘
â•‘    GET /api/salus/sync/cirugias                     â•‘
â•‘    GET /api/salus/sync/presupuestos                 â•‘
â•‘    GET /api/salus/sync/deudas                       â•‘
â•‘    GET /api/salus/sync/asociaciones                     â•‘
â•‘    GET /api/salus/sync/laboratorios                     
    GET /api/salus/sync/consultas                        
    GET /api/salus/health                            â•‘
â•šâ• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• â• 
    `);
    getPool().then(p => {
        console.log('✅ Conexión inicial lista. Configurando sincronizadores automáticos de Contact Center y SALUS...');
        
        // 1. TURNOS ONLINE (Cada 10 min)
        setTimeout(async () => {
            try {
                console.log('⏰ [Turnos Online Auto] Ejecutando sincronización inicial...');
                const poolInst = await getPool();
                await syncTurnosOnlineToSupabase(poolInst, { days: 2, supabaseClient: supabase });
                console.log('⏰ [Turnos Online Auto] ✅ Sincronización inicial completada con éxito.');
            } catch (e) {
                console.warn('⚠️ [Turnos Online Auto] Error en sincronización inicial:', e.message);
            }
        }, 15000);

        setInterval(async () => {
            try {
                console.log('⏰ [Turnos Online Auto] Ejecutando sincronización periódica (cada 10 min)...');
                const poolInst = await getPool();
                await syncTurnosOnlineToSupabase(poolInst, { days: 2, supabaseClient: supabase });
                console.log('⏰ [Turnos Online Auto] ✅ Sincronización periódica finalizada.');
            } catch (e) {
                console.warn('⚠️ [Turnos Online Auto] Error en ciclo periódico:', e.message);
            }
        }, 10 * 60 * 1000);

        // 2. DIAGNÓSTICOS, SÍNTOMAS Y EVOLUCIÓN (Cada 20 min)
        setTimeout(async () => {
            try {
                console.log('⏰ [Diagnósticos Auto] Ejecutando sincronización inicial (últimos 7 días)...');
                const f7 = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().split('T')[0];
                await syncDiagnosticos(f7);
                console.log('⏰ [Diagnósticos Auto] ✅ Sincronización inicial completada con éxito.');
            } catch (e) {
                console.warn('⚠️ [Diagnósticos Auto] Error en sincronización inicial:', e.message);
            }
        }, 30000);

        setInterval(async () => {
            try {
                console.log('⏰ [Diagnósticos Auto] Ejecutando sincronización periódica (últimos 7 días)...');
                const f7 = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().split('T')[0];
                await syncDiagnosticos(f7);
                console.log('⏰ [Diagnósticos Auto] ✅ Sincronización periódica finalizada.');
            } catch (e) {
                console.warn('⚠️ [Diagnósticos Auto] Error en ciclo periódico:', e.message);
            }
        }, 20 * 60 * 1000);

        // 3. PARÁMETROS MÉDICOS Y AGENDAS (Cada 30 min)
        setTimeout(async () => {
            try {
                console.log('⏰ [Médicos Auto] Ejecutando sincronización inicial de parámetros y condiciones...');
                await syncDoctorParameters();
                console.log('⏰ [Médicos Auto] ✅ Sincronización inicial completada con éxito.');
            } catch (e) {
                console.warn('⚠️ [Médicos Auto] Error en sincronización inicial:', e.message);
            }
        }, 45000);

        setInterval(async () => {
            try {
                console.log('⏰ [Médicos Auto] Ejecutando sincronización periódica de parámetros...');
                await syncDoctorParameters();
                console.log('⏰ [Médicos Auto] ✅ Sincronización periódica finalizada.');
            } catch (e) {
                console.warn('⚠️ [Médicos Auto] Error en ciclo periódico:', e.message);
            }
        }, 30 * 60 * 1000);
    }).catch(err => console.warn('⚠️ Conexión inicial fallida:', err.message));
});

process.on('SIGINT', async () => {
    console.log('\n🔒 Cerrando...');
    if (pool) await pool.close();
    process.exit(0);
});

process.on('uncaughtException', (err) => {
    console.error('❌ Error no capturado (uncaughtException):', err.message);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Promesa rechazada no capturada (unhandledRejection):', reason);
});

