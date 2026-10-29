/**
 * sync_turnos_contact_center.mjs
 * ==============================================================================
 * Sincronizador autónomo y liviano de Turnos y Cancelaciones del Contact Center.
 * 
 * Funciones:
 * 1. Conecta directamente a SQL Server SALUS (128.223.16.29:2450)
 * 2. Consulta los turnos creados hoy por las agentes del Contact Center
 * 3. Extrae la información completa incluyendo DNI, Paciente, Médico, etc.
 * 4. Consulta las cancelaciones/anulaciones registradas hoy por las agentes
 * 5. Guarda el detalle en Supabase app_config (cc_turnos_hoy) para auditoría en vivo
 * 6. Se ejecuta en bucle cada 5 minutos (300.000 ms)
 * 
 * NO interfiere con el sync-server principal ni modifica otros procesos.
 * ==============================================================================
 */

import sql from 'mssql';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envLocal = resolve(__dirname, '.env');
const envParent = resolve(__dirname, '..', '.env');
dotenv.config({ path: fs.existsSync(envLocal) ? envLocal : envParent });

// Supabase Client
const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://hakysnqiryimxbwdslwe.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Configuración SQL Server SALUS
const SQL_CONFIG = {
    server: process.env.SALUS_HOST || '128.223.16.29',
    port: parseInt(process.env.SALUS_PORT || '2450', 10),
    user: process.env.SALUS_USER || 'SalusConsulta',
    password: process.env.SALUS_PASSWORD || 'ConsultaSALUS1234',
    database: process.env.SALUS_DATABASE || 'SALUS',
    options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true,
        requestTimeout: 60000,
        connectionTimeout: 15000,
        tdsVersion: '7_4',
    },
    pool: { max: 3, min: 0, idleTimeoutMillis: 30000 }
};

// Mapeo oficial de agentes de Contact Center
const SALUS_AGENTS_MAP = {
    'OLIVIER ESQUIVEL, SOFIA FERNANDA': { id: 'solivier', name: 'Sofia Olivier' },
    'ACOSTA ESQUIVEL, MARIA ANTONELLA': { id: 'macosta', name: 'Antonella Acosta' },
    'JACQUES SORIA, VIRGINIA': { id: 'vjacques', name: 'Virginia Jacques' },
    'AGUILERA CARDOZO, DANIELA ROMINA': { id: 'daguilera', name: 'Daniela Aguilera' },
    'AGUILERA CARDOZO, ANA DANIELA ROMINA': { id: 'daguilera', name: 'Daniela Aguilera' },
    'AGUILERA, ANA DANIELA ROMINA': { id: 'daguilera', name: 'Daniela Aguilera' },
    'AGUILERA, DANIELA ROMINA': { id: 'daguilera', name: 'Daniela Aguilera' },
    'AGUILERA, DANIELA': { id: 'daguilera', name: 'Daniela Aguilera' },
    'LEAL, ERICA': { id: 'eleal', name: 'Erica Leal' },
    'LEAL,ERICA': { id: 'eleal', name: 'Erica Leal' }
};

let pool = null;

async function getSalusPool() {
    if (pool && !pool.connected) {
        try { await pool.close(); } catch (_) {}
        pool = null;
    }
    if (!pool || !pool.connected) {
        pool = await sql.connect(SQL_CONFIG);
    }
    return pool;
}

/**
 * Ejecuta la extracción de turnos y cancelaciones de hoy desde SALUS
 */
export async function syncTurnosContactCenter(targetDate = null) {
    const today = targetDate || new Date().toISOString().substring(0, 10);
    const dateFormatted = today.replace(/-/g, '');
    const [yyyy, mm, dd] = today.split('-');
    const dmyStr = `${dd}/${mm}/${yyyy}`;

    const nextD = new Date(today + 'T12:00:00Z');
    nextD.setUTCDate(nextD.getUTCDate() + 1);
    const nextDayFormatted = nextD.toISOString().substring(0, 10).replace(/-/g, '');

    const lookbackD = new Date(today + 'T12:00:00Z');
    lookbackD.setUTCDate(lookbackD.getUTCDate() - 60);
    const lookbackFormatted = lookbackD.toISOString().substring(0, 10).replace(/-/g, '');

    const agentNamesSql = Object.keys(SALUS_AGENTS_MAP).map(a => `'${a}'`).join(',');

    const p = await getSalusPool();

    // 1. TURNOS CREADOS / ASIGNADOS HOY POR LAS OPERADORAS (incluyendo traza en UsuarioCita)
    const queryTurnos = `
        SELECT 
            [idVisita],
            [IdPaciente],
            [Paciente],
            [NIF] AS DNI,
            [telefono1],
            [telefono2],
            [Visita_Especialidad] AS Especialidad,
            [Responsable] AS Medico,
            [Fecha Visita] AS FechaVisita,
            [Hora Inicio Visita Formato Texto] AS HoraVisita,
            [Tipo Visita] AS TipoVisita,
            [Cliente] AS ObraSocial,
            [Usuario Creacion Nombre] AS Agente,
            [UsuarioCita],
            [Fecha Hora Creacion] AS CreadoEl,
            CONVERT(VARCHAR(8), [Fecha Hora Creacion], 108) AS HoraCreacionExacta,
            CONVERT(VARCHAR(19), [Fecha Hora Creacion], 120) AS CreadoEl_str,
            [EstadoReprogramacion],
            [Asistencia],
            [Motivo_Ausencia],
            [Usuario_Ausencia]
        FROM [SALUS].[dbo].[VLISE_Visitas]
        WHERE ([Fecha Hora Creacion] >= '${lookbackFormatted}' OR [Fecha Visita] >= '${dateFormatted}')
          AND (
              ([Fecha Hora Creacion] >= '${dateFormatted}' AND [Fecha Hora Creacion] < '${nextDayFormatted}' AND [Usuario Creacion Nombre] IN (${agentNamesSql}))
              OR ([UsuarioCita] LIKE '%(${dmyStr} %' AND (
                  [UsuarioCita] LIKE '%OLIVIER ESQUIVEL%' OR
                  [UsuarioCita] LIKE '%JACQUES SORIA%' OR
                  [UsuarioCita] LIKE '%AGUILERA%DANIELA%' OR
                  [UsuarioCita] LIKE '%LEAL,%ERICA%' OR
                  [UsuarioCita] LIKE '%ACOSTA ESQUIVEL%'
              ))
          )
          AND ([Paciente] IS NULL OR [Paciente] <> 'TURNOS ONLINE, PACIENTE')
        ORDER BY [Fecha Hora Creacion] DESC
    `;

    // 2. TURNOS CANCELADOS / ANULADOS HOY POR O CON INTERVENCIÓN DE OPERADORAS
    const queryCancelaciones = `
        SELECT 
            [idVisita],
            [IdPaciente],
            [Paciente],
            [NIF] AS DNI,
            [telefono1],
            [telefono2],
            [Visita_Especialidad] AS Especialidad,
            [Responsable] AS Medico,
            [Fecha Visita] AS FechaVisita,
            [Hora Inicio Visita Formato Texto] AS HoraVisita,
            [Tipo Visita] AS TipoVisita,
            [Cliente] AS ObraSocial,
            [Usuario Creacion Nombre] AS AgenteCreacion,
            [Usuario_Ausencia] AS AgenteCancelacion,
            [Asistencia],
            [Motivo_Ausencia],
            [EstadoReprogramacion],
            [Fecha Hora Creacion] AS CreadoEl,
            CONVERT(VARCHAR(8), [Fecha Hora Creacion], 108) AS HoraCreacionExacta,
            CONVERT(VARCHAR(19), [Fecha Hora Creacion], 120) AS CreadoEl_str
        FROM [SALUS].[dbo].[VLISE_Visitas]
        WHERE [Usuario_Ausencia] IN (${agentNamesSql})
          AND [Fecha Visita] >= '${dateFormatted}'
          AND [Fecha Visita] <  '${nextDayFormatted}'
        ORDER BY [Fecha Visita] DESC
    `;

    const [resTurnos, resCanc] = await Promise.all([
        p.request().query(queryTurnos),
        p.request().query(queryCancelaciones)
    ]);

    const agentesMap = {
        solivier: { id: 'solivier', salusKey: 'OLIVIER ESQUIVEL, SOFIA FERNANDA', name: 'Sofia Olivier', turnos: 0, cancelados: 0, turnosDetalle: [], canceladosDetalle: [], seenVisitas: new Set() },
        vjacques: { id: 'vjacques', salusKey: 'JACQUES SORIA, VIRGINIA', name: 'Virginia Jacques', turnos: 0, cancelados: 0, turnosDetalle: [], canceladosDetalle: [], seenVisitas: new Set() },
        daguilera: { id: 'daguilera', salusKey: 'AGUILERA CARDOZO, DANIELA ROMINA', name: 'Daniela Aguilera', turnos: 0, cancelados: 0, turnosDetalle: [], canceladosDetalle: [], seenVisitas: new Set() },
        eleal: { id: 'eleal', salusKey: 'LEAL, ERICA', name: 'Erica Leal', turnos: 0, cancelados: 0, turnosDetalle: [], canceladosDetalle: [], seenVisitas: new Set() },
        macosta: { id: 'macosta', salusKey: 'ACOSTA ESQUIVEL, MARIA ANTONELLA', name: 'Antonella Acosta', turnos: 0, cancelados: 0, turnosDetalle: [], canceladosDetalle: [], seenVisitas: new Set() }
    };

    const CITA_AGENT_PATTERNS = [
        { id: 'solivier', regex: new RegExp(`OLIVIER ESQUIVEL[^()]*\\(${dmyStr}\\s+(\\d{2}:\\d{2}:\\d{2})\\)`, 'i') },
        { id: 'vjacques', regex: new RegExp(`JACQUES SORIA[^()]*\\(${dmyStr}\\s+(\\d{2}:\\d{2}:\\d{2})\\)`, 'i') },
        { id: 'daguilera', regex: new RegExp(`AGUILERA[^()]*DANIELA[^()]*\\(${dmyStr}\\s+(\\d{2}:\\d{2}:\\d{2})\\)`, 'i') },
        { id: 'eleal', regex: new RegExp(`LEAL,\\s*ERICA[^()]*\\(${dmyStr}\\s+(\\d{2}:\\d{2}:\\d{2})\\)`, 'i') },
        { id: 'macosta', regex: new RegExp(`ACOSTA ESQUIVEL[^()]*\\(${dmyStr}\\s+(\\d{2}:\\d{2}:\\d{2})\\)`, 'i') }
    ];

    // Procesar turnos creados / asignados
    for (const row of (resTurnos.recordset || [])) {
        const matchedAgents = new Map();
        const meta = SALUS_AGENTS_MAP[row.Agente];
        const creadoDateStr = row.CreadoEl_str ? row.CreadoEl_str.substring(0, 10) : (row.CreadoEl ? new Date(row.CreadoEl).toISOString().substring(0, 10) : '');
        if (meta && agentesMap[meta.id] && creadoDateStr === today) {
            matchedAgents.set(meta.id, row.HoraCreacionExacta || '');
        }
        if (row.UsuarioCita) {
            for (const pat of CITA_AGENT_PATTERNS) {
                const m = row.UsuarioCita.match(pat.regex);
                if (m && !matchedAgents.has(pat.id)) {
                    matchedAgents.set(pat.id, m[1] || '');
                }
            }
        }

        for (const [agId, horaAccion] of matchedAgents.entries()) {
            const agObj = agentesMap[agId];
            if (!agObj || agObj.seenVisitas.has(row.idVisita)) continue;
            agObj.seenVisitas.add(row.idVisita);
            agObj.turnos += 1;
            agObj.turnosDetalle.push({
                idVisita: row.idVisita,
                idPaciente: row.IdPaciente,
                paciente: row.Paciente,
                dni: String(row.DNI || '').trim(),
                telefono1: row.telefono1 || '',
                telefono2: row.telefono2 || '',
                especialidad: row.Especialidad || '',
                medico: row.Medico || '',
                fechaVisita: row.FechaVisita ? new Date(row.FechaVisita).toISOString().substring(0, 10) : '',
                horaVisita: row.HoraVisita || '',
                tipoVisita: row.TipoVisita || '',
                obraSocial: row.ObraSocial || '',
                asistencia: row.Asistencia || null,
                horaCreacion: horaAccion || row.HoraCreacionExacta || (row.CreadoEl ? new Date(row.CreadoEl).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''),
                creadoEl: horaAccion ? `${today}T${horaAccion}-03:00` : (row.CreadoEl_str ? `${row.CreadoEl_str.replace(' ', 'T')}-03:00` : (row.CreadoEl ? row.CreadoEl.toISOString() : ''))
            });
        }
    }

    // Procesar cancelaciones
    for (const row of (resCanc.recordset || [])) {
        const meta = SALUS_AGENTS_MAP[row.AgenteCancelacion];
        if (meta && agentesMap[meta.id]) {
            agentesMap[meta.id].cancelados += 1;
            agentesMap[meta.id].canceladosDetalle.push({
                idVisita: row.idVisita,
                idPaciente: row.IdPaciente,
                paciente: row.Paciente,
                dni: String(row.DNI || '').trim(),
                telefono1: row.telefono1 || '',
                telefono2: row.telefono2 || '',
                especialidad: row.Especialidad || '',
                medico: row.Medico || '',
                fechaVisita: row.FechaVisita ? new Date(row.FechaVisita).toISOString().substring(0, 10) : '',
                horaVisita: row.HoraVisita || '',
                asistencia: row.Asistencia || 'Cancelado/Ausente',
                motivoAusencia: row.Motivo_Ausencia || '',
                agenteCancelacion: meta.name
            });
        }
    }

    const cleanAgentes = Object.values(agentesMap).map(({ seenVisitas, ...rest }) => rest);

    const payload = {
        fecha: today,
        synced_at: new Date().toISOString(),
        total: cleanAgentes.reduce((acc, a) => acc + a.turnos, 0),
        totalCancelados: cleanAgentes.reduce((acc, a) => acc + a.cancelados, 0),
        agentes: cleanAgentes
    };

    // Subir a Supabase en app_config: clave histórica cc_turnos_contact_center_${today} y si es hoy actualizar cc_turnos_contact_center_hoy
    const currentToday = new Date().toISOString().substring(0, 10);
    const isToday = today === currentToday;

    const upsertPromises = [
        supabase.from('app_config').upsert({
            key: `cc_turnos_contact_center_${today}`,
            value: JSON.stringify(payload),
            label: `Turnos y Cancelaciones Contact Center (${today})`,
            category: 'contact_center_diario',
            updated_at: new Date().toISOString(),
            updated_by: 'sync_turnos_contact_center'
        })
    ];

    if (isToday) {
        upsertPromises.push(
            supabase.from('app_config').upsert({
                key: 'cc_turnos_contact_center_hoy',
                value: JSON.stringify(payload),
                label: 'Turnos y Cancelaciones Contact Center Hoy (SALUS con DNI y Detalles)',
                category: 'contact_center_diario',
                updated_at: new Date().toISOString(),
                updated_by: 'sync_turnos_contact_center'
            }),
            supabase.from('app_config').upsert({
                key: 'cc_turnos_hoy',
                value: JSON.stringify(payload),
                label: 'Turnos y Cancelaciones Contact Center Hoy (SALUS con DNI y Detalles)',
                category: 'contact_center_diario',
                updated_at: new Date().toISOString(),
                updated_by: 'sync_turnos_contact_center'
            })
        );
    }

    await Promise.all(upsertPromises);

    return payload;
}

// ==============================================================================
// 3. INGESTIÓN CONTINUA DE SOLICITUDES DE CANCELACIÓN DESDE WHATSAPP
// ==============================================================================
const regexCancel = /^-?Hola soy\s+(.+?),\s*con DNI:\s*(\d+),\s*tengo turno el\s*(\d{1,2}\/\d{1,2}\/\d{4})\s*a las\s*(\d{1,2}:\d{2}),?\s*en\s*(.+?),\s*con el (?:doctor|profesional|médico|medico)\s*(.+?),\s*y necesito\s*(.*)$/i;

function parseDateDmy(dmy) {
    if (!dmy) return null;
    const parts = dmy.split('/');
    if (parts.length === 3) {
        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
    return null;
}

export async function syncWhatsAppCancellations() {
    try {
        const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
        const { data: messages, error } = await supabase
            .from('whatsapp_messages')
            .select('*')
            .gte('created_at', since)
            .eq('direction', 'incoming')
            .ilike('content', '%-Hola soy%')
            .order('created_at', { ascending: true });

        if (error || !messages?.length) return 0;

        const { data: existentes } = await supabase
            .from('contact_center_cancelaciones')
            .select('dni, fecha_turno, hora_turno');

        const existSet = new Set((existentes || []).map(e => `${e.dni}_${e.fecha_turno}_${e.hora_turno}`));
        let inserted = 0;

        for (const msg of messages) {
            const m = msg.content.trim().match(regexCancel);
            if (!m) continue;

            const [, nombre, dni, fechaStr, hora, sede, medico, accion] = m;
            if (!(accion || '').toLowerCase().includes('cancelar')) continue;

            const fechaIso = parseDateDmy(fechaStr);
            const key = `${dni}_${fechaIso}_${hora}`;
            if (existSet.has(key)) continue;

            const { error: insErr } = await supabase
                .from('contact_center_cancelaciones')
                .insert({
                    phone: msg.phone,
                    dni: dni.trim(),
                    paciente_nombre: nombre.trim().toUpperCase(),
                    fecha_turno: fechaIso,
                    hora_turno: hora.trim(),
                    sede: sede.trim(),
                    medico: medico.trim().toUpperCase(),
                    motivo_paciente: msg.content.trim(),
                    origen: 'bot_whatsapp',
                    estado: 'pendiente',
                    created_at: msg.created_at,
                    updated_at: msg.created_at
                });

            if (!insErr) {
                inserted++;
                existSet.add(key);
            }
        }
        return inserted;
    } catch (e) {
        console.warn('[syncWhatsAppCancellations] Error:', e.message);
        return 0;
    }
}

// Modo demonio / ejecutor periódico (cada 5 minutos)
const INTERVAL_MS = 5 * 60 * 1000;

async function runCycle() {
    const timestamp = new Date().toLocaleTimeString('es-AR');
    try {
        const res = await syncTurnosContactCenter();
        console.log(`[${timestamp}] ✅ Sincronizados ${res.total} turnos y ${res.totalCancelados} cancelaciones con DNI a Supabase.`);
        res.agentes.forEach(a => {
            if (a.turnos > 0 || a.cancelados > 0) {
                console.log(`   • ${a.name}: ${a.turnos} turnos dados, ${a.cancelados} cancelados`);
            }
        });

        const cancelIngested = await syncWhatsAppCancellations();
        if (cancelIngested > 0) {
            console.log(`[${timestamp}] 📥 Ingestadas ${cancelIngested} nuevas cancelaciones de pacientes vía WhatsApp.`);
        }
    } catch (err) {
        console.error(`[${timestamp}] ❌ Error en ciclo de sincronización CC:`, err.message);
    }
}

// Ejecutar inmediatamente solo si es invocado directamente desde consola
const isMain = process.argv[1] && (process.argv[1].includes('sync_turnos_contact_center') || process.argv[1].endsWith('sync_turnos_contact_center.mjs'));
if (isMain) {
    runCycle();
    if (process.argv.includes('--daemon') || process.argv.includes('-d')) {
        console.log(`🚀 Servicio autónomo de turnos Contact Center activo. Intervalo: 5 minutos.`);
        setInterval(runCycle, INTERVAL_MS);
    }
}

