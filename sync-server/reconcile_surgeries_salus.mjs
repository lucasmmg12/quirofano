import sql from 'mssql';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
for (const p of [resolve(__dirname, '.env'), resolve(__dirname, '..', '.env'), resolve(__dirname, '..', '.env.local')]) {
    if (fs.existsSync(p)) config({ path: p });
}

const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

const sqlConfig = {
    server: process.env.SALUS_DB_SERVER,
    port: parseInt(process.env.SALUS_DB_PORT || '2450', 10),
    user: process.env.SALUS_DB_USER,
    password: process.env.SALUS_DB_PASSWORD,
    database: process.env.SALUS_DB_NAME || 'SALUS',
    options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true, requestTimeout: 120000, tdsVersion: '7_4' }
};

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
    if (cleaned.startsWith('549') && cleaned.length === 13) {
        return { normalized: cleaned, valid: true, original: raw };
    }
    if (cleaned.length === 10 && !cleaned.startsWith('0')) {
        return { normalized: '549' + cleaned, valid: true, original: raw };
    }
    if (cleaned.length >= 7 && cleaned.length <= 8) {
        return { normalized: '549' + areaCode + cleaned, valid: true, original: raw };
    }
    return { normalized: cleaned, valid: false, original: raw };
}

const EXCLUDED_CONTACT_CENTER_MODULES = [
    'Transferencia embrionaria',
    'Fertilidad',
    'Bloque Médico',
    'COLOCACION DE MEDICAMENTO',
    'COLOCACION DE MEDICACION',
    'HIERRO',
    'FERROCARBOXIMALTOSA',
    'SACARATO'
];

const FIELDS_TO_PRESERVE = [
    'status', 'notificado_at', 'documentacion_recibida_at', 'autorizado_at',
    'confirmado_at', 'archivos', 'whatsapp_message_id', 'ultimo_mensaje_at',
    'notas', 'operador', 'telefono', 'dni', 'instrucciones', 'motivo'
];

const pool = await sql.connect(sqlConfig);

console.log('1. Extrayendo cirugías 2026 desde SALUS (VLISE_Visitas + Cirujano de Foja)...');
const salusRes = await pool.request().query(`
    SELECT 
        v.idVisita,
        CONVERT(VARCHAR(10), CAST(v.[Fecha Visita] AS DATE), 120) AS Fecha,
        v.IdPaciente AS idPaciente,
        v.Paciente,
        v.NIF,
        v.telefono1,
        v.[Grupo Agenda] AS GrupoAgenda,
        v.Agenda,
        COALESCE(
            NULLIF(LTRIM(RTRIM(tc.Cirujano)), ''),
            NULLIF(LTRIM(RTRIM(v.Responsable)), ''),
            v.[Grupo Agenda]
        ) AS Medico,
        v.Asistencia,
        v.[Tipo Visita] AS Modulo,
        v.Cliente AS Mutua,
        v.Motivo_Ausencia
    FROM dbo.VLISE_Visitas v WITH (NOLOCK)
    OUTER APPLY (
        SELECT TOP 1 Cirujano, Anestesista
        FROM dbo.TABLEAU_Cirugias c WITH (NOLOCK)
        WHERE c.idvisita = v.idVisita
    ) tc
    WHERE CAST(v.[Fecha Visita] AS DATE) >= '2026-01-01'
      AND (
          v.[Grupo Agenda] IN (N'QUIRÓFANOS CENTRALES', N'QUIRÓFANOS HdD')
          OR (v.[Grupo Agenda] = N'HEMODINAMIA' AND tc.Anestesista IS NOT NULL AND LEN(LTRIM(RTRIM(tc.Anestesista))) > 0)
      )
      AND ISNULL(v.[Tipo Visita], '') NOT LIKE '%COLOCACION DE MEDICAM%'
      AND ISNULL(v.[Tipo Visita], '') NOT LIKE '%HEMOTERAPIA%'
      AND ISNULL(v.[Tipo Visita], '') NOT LIKE '%HIERRO%'
      AND ISNULL(v.[Tipo Visita], '') NOT LIKE '%FERROCARBOXIMALTOSA%'
      AND ISNULL(v.[Tipo Visita], '') NOT LIKE '%SACARATO%'
      AND ISNULL(v.Paciente, '') NOT LIKE '%Bloque%'
      AND v.IdPaciente IS NOT NULL
    ORDER BY CAST(v.[Fecha Visita] AS DATE) ASC,
             CASE WHEN v.Asistencia IN ('Presente', 'URGENCIA', 'NO PROGRAMADA', 'INTERNADO') THEN 0
                  WHEN v.Asistencia IS NULL THEN 1
                  ELSE 2 END ASC,
             v.idVisita ASC
`);

console.log('   Total filas SALUS 2026 extraídas:', salusRes.recordset.length);

// 2. Cargar filas actuales de Supabase surgeries en 2026 para preservar estados de Contact Center
console.log('2. Cargando filas existentes en Supabase surgeries (2026) para preservar gestión...');
let existingSupa = [];
let from = 0;
while (true) {
    const { data, error } = await supabase
        .from('surgeries')
        .select('*')
        .gte('fecha_cirugia', '2026-01-01')
        .range(from, from + 999);
    if (error) throw error;
    if (!data || data.length === 0) break;
    existingSupa = existingSupa.concat(data);
    if (data.length < 1000) break;
    from += 1000;
}
console.log('   Filas existentes en Supabase 2026:', existingSupa.length);

// Mapa de preservación por id_paciente|fecha_cirugia y por shortName|fecha_cirugia
const preservedByIdDate = new Map();
const preservedByShortNameDate = new Map();

function mergePreserved(target, row) {
    for (const f of FIELDS_TO_PRESERVE) {
        if (row[f] != null && row[f] !== '' && target[f] == null) {
            target[f] = row[f];
        }
    }
}

for (const row of existingSupa) {
    const idKey = row.id_paciente ? `${row.id_paciente}|${row.fecha_cirugia}` : null;
    if (idKey) {
        if (!preservedByIdDate.has(idKey)) preservedByIdDate.set(idKey, {});
        mergePreserved(preservedByIdDate.get(idKey), row);
    }
    const words = normalizeNameForUpsert(row.nombre).split(' ');
    const shortKey = `${words[0] || ''}|${words[1] || ''}|${row.fecha_cirugia}`;
    if (!preservedByShortNameDate.has(shortKey)) preservedByShortNameDate.set(shortKey, {});
    mergePreserved(preservedByShortNameDate.get(shortKey), row);
}

// 3. Construir filas canónicas 1 a 1 con SALUS
const countByPatientDate = new Map();
const canonicalRows = [];
const canonicalKeySet = new Set();

for (const r of salusRes.recordset) {
    const id_paciente = String(r.idPaciente).trim();
    const baseName = normalizeNameForUpsert(r.Paciente);
    if (!baseName || !id_paciente) continue;

    const fecha_cirugia = r.Fecha;
    const pdKey = `${id_paciente}|${fecha_cirugia}`;
    const seq = (countByPatientDate.get(pdKey) || 0) + 1;
    countByPatientDate.set(pdKey, seq);

    const nombre = seq === 1 ? baseName : `${baseName} (${seq})`;
    const fullKey = `${id_paciente}|${nombre}|${fecha_cirugia}`;
    canonicalKeySet.add(fullKey);

    const words = baseName.split(' ');
    const shortKey = `${words[0] || ''}|${words[1] || ''}|${fecha_cirugia}`;
    const preserved = preservedByIdDate.get(pdKey) || preservedByShortNameDate.get(shortKey) || {};

    const phone = normalizePhone(r.telefono1 ? String(r.telefono1) : '');
    const rawDni = r.NIF ? String(r.NIF).replace(/\D/g, '').trim() : null;
    const descripcion = r.Modulo || '(CX) CIRUGIA GENERAL';
    const isContactCenterExcluded = seq > 1 || EXCLUDED_CONTACT_CENTER_MODULES.some(m => descripcion.toLowerCase().includes(m.toLowerCase()));

    const todayIso = new Date().toISOString().split('T')[0];
    const asist = r.Asistencia ? String(r.Asistencia).trim() : null;
    const isSuspendedInSalus = asist === 'SUSPENDIDA' || asist === 'CX SUSPENDIDA 24H' || asist === 'Ausencia';
    const isUpcomingPending = !isSuspendedInSalus && (fecha_cirugia > todayIso || (fecha_cirugia === todayIso && asist === null));

    let ausente = null;
    let status = preserved.status || 'lila';
    let motivo = null;

    if (isSuspendedInSalus) {
        ausente = '1';
        status = 'rojo';
        const salusMot = `[${asist}]${r.Motivo_Ausencia ? ' ' + String(r.Motivo_Ausencia).trim() : ''}`;
        motivo = (preserved.motivo && preserved.motivo.trim()) ? preserved.motivo : salusMot;
    } else if (isUpcomingPending) {
        ausente = null;
        if (status === 'rojo' || status === 'suspendida') {
            status = 'lila';
        }
        motivo = null;
    } else {
        ausente = '0';
        if (status === 'rojo' || status === 'suspendida') {
            status = 'lila';
        }
        motivo = null;
    }

    let instrucciones = preserved.instrucciones || null;
    const cleanInst = instrucciones ? instrucciones.replace(/\s*\[FOJA_SIN_RECEPCION_VISITA\]/g, '').trim() : '';
    if (asist === null && fecha_cirugia < todayIso) {
        instrucciones = cleanInst ? `${cleanInst} [FOJA_SIN_RECEPCION_VISITA]` : '[FOJA_SIN_RECEPCION_VISITA]';
    } else {
        instrucciones = cleanInst || null;
    }

    canonicalRows.push({
        id_paciente,
        nombre,
        fecha_cirugia,
        dni: (rawDni && rawDni.length >= 6) ? rawDni : (preserved.dni || null),
        telefono: preserved.telefono || phone.normalized || '',
        telefono_original: phone.original || '',
        descripcion,
        modulo: descripcion,
        obra_social: r.Mutua || null,
        ausente,
        status,
        motivo,
        grupo_agendas: r.GrupoAgenda || null,
        medico: r.Medico || r.GrupoAgenda || null,
        instrucciones,
        excluido: isContactCenterExcluded,
        notificado_at: preserved.notificado_at || null,
        documentacion_recibida_at: preserved.documentacion_recibida_at || null,
        autorizado_at: preserved.autorizado_at || null,
        confirmado_at: preserved.confirmado_at || null,
        archivos: preserved.archivos || null,
        whatsapp_message_id: preserved.whatsapp_message_id || null,
        ultimo_mensaje_at: preserved.ultimo_mensaje_at || null,
        notas: preserved.notas || null,
        operador: preserved.operador || null
    });
}

console.log('3. Filas canónicas preparadas:', canonicalRows.length);

// Identificar filas obsoletas/duplicadas en Supabase 2026 que NO pertenecen al conjunto canónico
const staleIds = [];
for (const row of existingSupa) {
    const k = `${row.id_paciente || ''}|${row.nombre || ''}|${row.fecha_cirugia || ''}`;
    if (!canonicalKeySet.has(k)) {
        staleIds.push(row.id);
    }
}
console.log('4. Eliminando filas duplicadas/obsoletas en Supabase 2026:', staleIds.length);

const DEL_BATCH = 200;
let deletedCount = 0;
for (let i = 0; i < staleIds.length; i += DEL_BATCH) {
    const batch = staleIds.slice(i, i + DEL_BATCH);
    const { error } = await supabase.from('surgeries').delete().in('id', batch);
    if (error) {
        console.error('Error borrando lote:', error.message);
    } else {
        deletedCount += batch.length;
    }
}
console.log(`   ✅ ${deletedCount} filas duplicadas/obsoletas eliminadas.`);

// Upsert de todas las filas canónicas
console.log('5. Sincronizando filas canónicas en Supabase surgeries...');
const UPSERT_BATCH = 200;
let upsertedCount = 0;
for (let i = 0; i < canonicalRows.length; i += UPSERT_BATCH) {
    const batch = canonicalRows.slice(i, i + UPSERT_BATCH);
    const { error } = await supabase
        .from('surgeries')
        .upsert(batch, { onConflict: 'id_paciente,nombre,fecha_cirugia', ignoreDuplicates: false });
    if (error) {
        console.error(`Error en upsert lote ${i}:`, error.message);
    } else {
        upsertedCount += batch.length;
    }
}
console.log(`   ✅ ${upsertedCount} filas canónicas sincronizadas.`);

// 6. Verificación final en Supabase para Octubre 2026
let verifyOct = [];
let vFrom = 0;
while (true) {
    const { data } = await supabase
        .from('surgeries')
        .select('id, nombre, fecha_cirugia, grupo_agendas, status, ausente, motivo, instrucciones, excluido')
        .gte('fecha_cirugia', '2026-10-01')
        .lte('fecha_cirugia', '2026-10-31')
        .range(vFrom, vFrom + 999);
    if (!data || data.length === 0) break;
    verifyOct = verifyOct.concat(data);
    if (data.length < 1000) break;
    vFrom += 1000;
}

const vCentrales = verifyOct.filter(s => s.grupo_agendas === 'QUIRÓFANOS CENTRALES');
const vHdd = verifyOct.filter(s => s.grupo_agendas === 'QUIRÓFANOS HdD');
const vHemo = verifyOct.filter(s => s.grupo_agendas === 'HEMODINAMIA');
const isReal = s => !(s.ausente === '1' || s.status === 'rojo' || (s.motivo && s.motivo.trim()));
const isVisitaReal = s => isReal(s) && !(s.instrucciones || '').includes('[FOJA_SIN_RECEPCION_VISITA]');

console.log('\n=== VERIFICACIÓN FINAL SUPABASE OCTUBRE 2026 ===');
console.log(`Quirófano Central: ${vCentrales.filter(isReal).length} fojas (${vCentrales.filter(isVisitaReal).length} visitas) / ${vCentrales.length} programadas`);
console.log(`Hospital de Día (HdD): ${vHdd.filter(isReal).length} fojas (${vHdd.filter(isVisitaReal).length} visitas) / ${vHdd.length} programadas`);
console.log(`TOTAL QUIRÓFANO (Central + HdD): ${vCentrales.filter(isReal).length + vHdd.filter(isReal).length} fojas (${vCentrales.filter(isVisitaReal).length + vHdd.filter(isVisitaReal).length} visitas) / ${vCentrales.length + vHdd.length} programadas`);
console.log(`Hemodinamia c/ Anest. (Separado): ${vHemo.filter(isReal).length} realizadas / ${vHemo.length} programadas`);

await pool.close();
