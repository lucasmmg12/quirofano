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

    const nextD = new Date(today + 'T12:00:00Z');
    nextD.setUTCDate(nextD.getUTCDate() + 1);
    const nextDayFormatted = nextD.toISOString().substring(0, 10).replace(/-/g, '');

    const agentNamesSql = Object.keys(SALUS_AGENTS_MAP).map(a => `'${a}'`).join(',');

    const p = await getSalusPool();

    // 1. TURNOS CREADOS HOY POR LAS OPERADORAS
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
            [Fecha Hora Creacion] AS CreadoEl,
            [EstadoReprogramacion],
            [Asistencia],
            [Motivo_Ausencia],
            [Usuario_Ausencia]
        FROM [SALUS].[dbo].[VLISE_Visitas]
        WHERE [Fecha Hora Creacion] >= '${dateFormatted}'
          AND [Fecha Hora Creacion] <  '${nextDayFormatted}'
          AND [Usuario Creacion Nombre] IN (${agentNamesSql})
          AND [Paciente] <> 'TURNOS ONLINE, PACIENTE'
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
            [Fecha Hora Creacion] AS CreadoEl
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
        solivier: { id: 'solivier', salusKey: 'OLIVIER ESQUIVEL, SOFIA FERNANDA', name: 'Sofia Olivier', turnos: 0, cancelados: 0, turnosDetalle: [], canceladosDetalle: [] },
        vjacques: { id: 'vjacques', salusKey: 'JACQUES SORIA, VIRGINIA', name: 'Virginia Jacques', turnos: 0, cancelados: 0, turnosDetalle: [], canceladosDetalle: [] },
        daguilera: { id: 'daguilera', salusKey: 'AGUILERA CARDOZO, DANIELA ROMINA', name: 'Daniela Aguilera', turnos: 0, cancelados: 0, turnosDetalle: [], canceladosDetalle: [] },
        eleal: { id: 'eleal', salusKey: 'LEAL, ERICA', name: 'Erica Leal', turnos: 0, cancelados: 0, turnosDetalle: [], canceladosDetalle: [] },
        macosta: { id: 'macosta', salusKey: 'ACOSTA ESQUIVEL, MARIA ANTONELLA', name: 'Antonella Acosta', turnos: 0, cancelados: 0, turnosDetalle: [], canceladosDetalle: [] }
    };

    // Procesar turnos creados
    for (const row of (resTurnos.recordset || [])) {
        const meta = SALUS_AGENTS_MAP[row.Agente];
        if (meta && agentesMap[meta.id]) {
            agentesMap[meta.id].turnos += 1;
            agentesMap[meta.id].turnosDetalle.push({
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
                horaCreacion: row.CreadoEl ? new Date(row.CreadoEl).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '',
                creadoEl: row.CreadoEl ? row.CreadoEl.toISOString() : ''
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

    const payload = {
        fecha: today,
        synced_at: new Date().toISOString(),
        total: Object.values(agentesMap).reduce((acc, a) => acc + a.turnos, 0),
        totalCancelados: Object.values(agentesMap).reduce((acc, a) => acc + a.cancelados, 0),
        agentes: Object.values(agentesMap)
    };

    // Subir a Supabase en app_config (cc_turnos_contact_center_hoy y cc_turnos_hoy)
    await Promise.all([
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
    ]);

    return payload;
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
    } catch (err) {
        console.error(`[${timestamp}] ❌ Error en sincronización de turnos CC:`, err.message);
    }
}

// Ejecutar inmediatamente
runCycle();

// Si se ejecuta con flag --daemon o normal, mantener corriendo cada 5 min
if (process.argv.includes('--daemon') || process.argv.includes('-d')) {
    console.log(`🚀 Servicio autónomo de turnos Contact Center activo. Intervalo: 5 minutos.`);
    setInterval(runCycle, INTERVAL_MS);
}
