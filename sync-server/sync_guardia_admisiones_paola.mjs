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

const SQL_CONFIG = {
    server: process.env.SALUS_HOST || process.env.SALUS_DB_SERVER || '128.223.16.29',
    port: parseInt(process.env.SALUS_PORT || process.env.SALUS_DB_PORT || '2450', 10),
    user: process.env.SALUS_USER || process.env.SALUS_DB_USER || 'SalusConsulta',
    password: process.env.SALUS_PASSWORD || process.env.SALUS_DB_PASSWORD || 'ConsultaSALUS1234',
    database: process.env.SALUS_DATABASE || process.env.SALUS_DB_NAME || 'SALUS',
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

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://hakysnqiryimxbwdslwe.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const DAY_MS = 86400000;
const HOUR_MS = 3600000;

function normalizeText(val) {
    if (!val) return '';
    return String(val)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .trim();
}

/**
 * Parsea fecha local del hospital ('YYYY-MM-DD HH:mm:ss' o 'DD/MM/YYYY HH:mm:ss')
 * a milisegundos sobre un reloj civil uniforme (Date.UTC) para evitar desfasajes de huso horario al cortar medianoches.
 */
function parseHospitalClockMs(val) {
    if (!val) return null;
    const str = String(val).trim();
    if (!str) return null;

    // Formato YYYY-MM-DD HH:mm:ss
    const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (isoMatch) {
        const [, y, m, d, hh = '0', mm = '0', ss = '0'] = isoMatch;
        return Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss));
    }

    // Formato DD/MM/YYYY HH:mm:ss (usado en TABLEAU_Admisiones con historial de camas2)
    const dmyMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (dmyMatch) {
        const [, d, m, y, hh = '0', mm = '0', ss = '0'] = dmyMatch;
        return Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss));
    }

    return null;
}

function clockMsToIsoAr(ms) {
    if (ms === null || ms === undefined) return null;
    const d = new Date(ms);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mi = String(d.getUTCMinutes()).padStart(2, '0');
    const ss = String(d.getUTCSeconds()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}-03:00`;
}

function clockMsToYMD(ms) {
    const d = new Date(ms);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function clockMsToHM(ms) {
    const d = new Date(ms);
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mi = String(d.getUTCMinutes()).padStart(2, '0');
    return `${hh}:${mi}`;
}

function nowHospitalClockMs() {
    // Hora actual en Argentina (UTC-3) expresada en el mismo eje civil Date.UTC
    return Date.now() - 3 * HOUR_MS;
}

function classifyUnit(rawHab, rawCama = '') {
    const cleanHab = String(rawHab || '').trim();
    const cleanCama = String(rawCama || '').trim();
    const combined = cleanCama && !cleanHab.toUpperCase().endsWith(`-${cleanCama.toUpperCase()}`)
        ? `${cleanHab}-${cleanCama}`
        : cleanHab;
    const h = normalizeText(combined);
    const c = normalizeText(cleanCama);

    if (!h) {
        return { unidad: 'SIN_HABITACION', tipo: 'SIN_HABITACION', label: 'Sin Habitación' };
    }
    if (c === 'SR' || (h.startsWith('BOX') && (h.includes('-SR') || h.includes('SHOCK') || h.includes('GUARDIA')))) {
        const m = h.match(/BOX\s*(\d+)/);
        const canonical = m ? `BOX ${m[1]}-SR` : combined.toUpperCase();
        return { unidad: canonical, tipo: 'SHOCK_ROOM_BOX', label: canonical };
    }
    if (h.includes('AUXILIAR') || /^BOX\s*\d+-B\d+$/.test(h)) {
        return { unidad: combined, tipo: 'CAMA_AUXILIAR', label: combined };
    }
    if (/^22[2-9]/.test(h) || /^207/.test(h) || h.includes('UCI') || h.includes('UTI')) {
        return { unidad: combined, tipo: 'CRITICOS_UCI', label: combined };
    }
    return { unidad: combined, tipo: 'PISO_CLINICO', label: combined };
}

/**
 * Une intervalos [startMs, endMs] para calcular el tiempo físico neto ocupado sin duplicar solapamientos
 */
function mergeIntervals(intervals) {
    if (!intervals.length) return { netMs: 0, grossMs: 0, overlapMs: 0 };
    let grossMs = 0;
    const sorted = intervals
        .filter(iv => iv.endMs > iv.startMs)
        .map(iv => {
            grossMs += iv.endMs - iv.startMs;
            return { startMs: iv.startMs, endMs: iv.endMs };
        })
        .sort((a, b) => a.startMs - b.startMs);

    if (!sorted.length) return { netMs: 0, grossMs: 0, overlapMs: 0 };

    const merged = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
        const cur = sorted[i];
        const last = merged[merged.length - 1];
        if (cur.startMs < last.endMs) {
            if (cur.endMs > last.endMs) last.endMs = cur.endMs;
        } else {
            merged.push(cur);
        }
    }

    const netMs = merged.reduce((acc, iv) => acc + (iv.endMs - iv.startMs), 0);
    const overlapMs = Math.max(0, grossMs - netMs);
    return { netMs, grossMs, overlapMs };
}

/**
 * Conteo tradicional distorsionado de referencia (para demostrarle a Gerencia cuántos "días" inflaba el método viejo):
 * En método tradicional cada paciente presente en el box en un día cuenta al menos 1 día (o 0.5).
 * Como explicó el usuario: "entra al box 3hs y le contamos 1 día entero, después entra otra persona al mismo box y tuvo 2 días en 1".
 */
function calcDiasConteoTradicionalPaciente(ingMs, altaMs) {
    if (!ingMs || !altaMs || altaMs < ingMs) return 0;
    const d1 = Math.floor(ingMs / DAY_MS);
    const d2 = Math.floor(altaMs / DAY_MS);
    return Math.max(1, d2 - d1 + 1);
}

export async function syncGuardiaAdmisionesPaola({ startYear = 2025 } = {}) {
    console.log(`\n🏥 [SYNC GUARDIA ADMISIONES DRA. PAOLA GARCÍA] Conectando a SALUS (${startYear}+)...`);
    const pool = await sql.connect(SQL_CONFIG);
    const nowClockMs = nowHospitalClockMs();
    const nowIso = new Date().toISOString();

    try {
        // 1. Extraer todas las admisiones donde el médico de cabecera es Dra. Paola García
        const qAdm = `
            SELECT
                a.idAdmision AS id_admision,
                LTRIM(RTRIM(a.[Número admisión])) AS numero_admision,
                LTRIM(RTRIM(a.[Serie Admisión])) AS serie_admision,
                a.Dias AS dias_salus,
                a.Edad AS edad_salus,
                LTRIM(RTRIM(a.Procedencia)) AS procedencia_salus,
                LTRIM(RTRIM(a.Paciente)) AS paciente,
                LTRIM(RTRIM(CAST(a.NHC AS VARCHAR(50)))) AS nhc,
                LTRIM(RTRIM(CAST(a.NIF AS VARCHAR(50)))) AS dni,
                LTRIM(RTRIM(a.Cliente)) AS obra_social,
                LTRIM(RTRIM(a.Doctor)) AS doctor_cabecera,
                LTRIM(RTRIM(a.Servicio)) AS servicio_salus,
                LTRIM(RTRIM(a.Especialidad)) AS especialidad_salus,
                LTRIM(RTRIM(a.Proceso)) AS proceso_salus,
                LTRIM(RTRIM(a.[Motivo de alta])) AS motivo_alta,
                LTRIM(RTRIM(a.Estado)) AS estado_salus,
                LTRIM(RTRIM(a.[Habitación])) AS habitacion_salus,
                CONVERT(VARCHAR(19), a.[Fecha ingreso], 120) AS fecha_ingreso_str,
                CONVERT(VARCHAR(19), a.[Fecha alta], 120) AS fecha_alta_str
            FROM [SALUS].[dbo].[TABLEAU_Admisiones] a WITH (NOLOCK)
            WHERE a.[Fecha ingreso] >= '${startYear}-01-01'
              AND ISNULL(a.Estado, '') NOT IN ('ANULADA', 'CANCELADA')
              AND UPPER(LTRIM(RTRIM(ISNULL(a.Doctor, '')))) LIKE '%GARCIA%PAOLA%'
            ORDER BY a.[Fecha ingreso] DESC, a.idAdmision DESC;
        `;
        const admRes = await pool.request().query(qAdm);
        const admMap = new Map();
        for (const r of admRes.recordset || []) {
            const id = Number(r.id_admision);
            if (id && !admMap.has(id)) admMap.set(id, r);
        }
        const admRows = Array.from(admMap.values());
        console.log(`   ✅ ${admRows.length} admisiones únicas de Dra. Paola García extraídas (${startYear}+).`);

        // 2. Extraer tramos exactos de camas en [TABLEAU_Admisiones con historial de camas2] (incluyendo NombreCama = 'SR')
        const qHist = `
            SELECT
                h.idadmision AS id_admision,
                LTRIM(RTRIM(h.NombreHabitacion)) AS nombre_habitacion,
                LTRIM(RTRIM(h.NombreCama)) AS nombre_cama,
                LTRIM(RTRIM(h.fechaInicio)) AS fecha_inicio_str,
                LTRIM(RTRIM(h.fechaFin)) AS fecha_fin_str,
                LTRIM(RTRIM(h.HOSP_Servicio)) AS hosp_servicio
            FROM [SALUS].[dbo].[TABLEAU_Admisiones con historial de camas2] h WITH (NOLOCK)
            INNER JOIN [SALUS].[dbo].[TABLEAU_Admisiones] a WITH (NOLOCK) ON h.idadmision = a.idAdmision
            WHERE a.[Fecha ingreso] >= '${startYear}-01-01'
              AND ISNULL(a.Estado, '') NOT IN ('ANULADA', 'CANCELADA')
              AND UPPER(LTRIM(RTRIM(ISNULL(a.Doctor, '')))) LIKE '%GARCIA%PAOLA%';
        `;
        const histRes = await pool.request().query(qHist);
        const histByAdm = new Map();
        for (const h of histRes.recordset || []) {
            const id = Number(h.id_admision);
            if (!id) continue;
            if (!histByAdm.has(id)) histByAdm.set(id, []);
            histByAdm.get(id).push(h);
        }

        // 3. Extraer actividad clínica en VLISE_Visitas (cantidad de actuaciones en HC + vínculo con Protocolo 557)
        const qVisitas = `
            SELECT
                v.IdHospitalizacion AS id_admision,
                COUNT(DISTINCT v.idVisita) AS visitas_hc_count,
                MAX(CASE WHEN v.[Tipo Visita] = '(INT) ADMISION MEDICA CLINICA' THEN v.idVisita ELSE NULL END) AS id_visita_557,
                CONVERT(VARCHAR(19), MAX(v.[Fecha Visita]), 120) AS ultima_visita_str
            FROM [SALUS].[dbo].[VLISE_Visitas] v WITH (NOLOCK)
            INNER JOIN (
                SELECT DISTINCT idAdmision
                FROM [SALUS].[dbo].[TABLEAU_Admisiones] WITH (NOLOCK)
                WHERE [Fecha ingreso] >= '${startYear}-01-01'
                  AND ISNULL(Estado, '') NOT IN ('ANULADA', 'CANCELADA')
                  AND UPPER(LTRIM(RTRIM(ISNULL(Doctor, '')))) LIKE '%GARCIA%PAOLA%'
            ) pa ON v.IdHospitalizacion = pa.idAdmision
            GROUP BY v.IdHospitalizacion;
        `;
        const visRes = await pool.request().query(qVisitas);
        const visByAdm = new Map();
        for (const v of visRes.recordset || []) {
            visByAdm.set(Number(v.id_admision), v);
        }

        // 4. Procesar admisiones, clasificar inconsistencias y cortar tramos diarios [00:00 - 24:00]
        const processedAdmissions = [];
        // Mapa diario: key = `${fecha}|${unidad}` -> bucket
        const dailyBuckets = new Map();

        const pushDailySlice = ({
            fecha,
            unidad,
            tipoUnidad,
            idAdmision,
            numeroAdmision,
            paciente,
            nhc,
            obraSocial,
            servicioSalus,
            sliceStartMs,
            sliceEndMs,
            dayStartMs
        }) => {
            if (sliceEndMs <= sliceStartMs) return;
            const key = `${fecha}|${unidad}`;
            let b = dailyBuckets.get(key);
            if (!b) {
                b = {
                    fecha,
                    periodo: fecha.slice(0, 7),
                    unidad,
                    tipo_unidad: tipoUnidad,
                    horas_disponibles: tipoUnidad === 'SHOCK_ROOM_BOX' ? 24 : 24,
                    admIds: new Set(),
                    intervals: [],
                    tramosDia: []
                };
                dailyBuckets.set(key, b);
            }
            b.admIds.add(idAdmision);
            b.intervals.push({ startMs: sliceStartMs, endMs: sliceEndMs, idAdmision });

            const horasTramo = (sliceEndMs - sliceStartMs) / HOUR_MS;
            b.tramosDia.push({
                id_admision: idAdmision,
                numero_admision: numeroAdmision,
                paciente,
                nhc,
                obra_social: obraSocial,
                servicio_salus: servicioSalus,
                inicio_hm: clockMsToHM(sliceStartMs),
                fin_hm: sliceEndMs - dayStartMs >= DAY_MS ? '24:00' : clockMsToHM(sliceEndMs),
                min_inicio: Math.round((sliceStartMs - dayStartMs) / 60000),
                min_fin: Math.round((sliceEndMs - dayStartMs) / 60000),
                horas: Math.round(horasTramo * 100) / 100,
                proporcion_dia: Math.round((horasTramo / 24) * 10000) / 10000
            });
        };

        for (const r of admRows) {
            const idAdm = Number(r.id_admision);
            const ingMs = parseHospitalClockMs(r.fecha_ingreso_str);
            if (!ingMs) continue;
            const altaMsRaw = parseHospitalClockMs(r.fecha_alta_str);
            const isOpen = !altaMsRaw;
            const effectiveEndMs = altaMsRaw || nowClockMs;
            const rawHours = Math.max(0, (effectiveEndMs - ingMs) / HOUR_MS);

            const visInfo = visByAdm.get(idAdm);
            const visitasHcCount = Number(visInfo?.visitas_hc_count || 0);
            const idVisita557 = visInfo?.id_visita_557 ? Number(visInfo.id_visita_557) : null;
            const ultimaVisitaMs = parseHospitalClockMs(visInfo?.ultima_visita_str);

            // Construir tramos físicos desde Historial de Camas2 (deduplicados)
            const rawHist = histByAdm.get(idAdm) || [];
            const dedupTramosKey = new Set();
            const parsedTramos = [];

            for (const h of rawHist) {
                const tStart = parseHospitalClockMs(h.fecha_inicio_str);
                if (!tStart) continue;
                const tEndRaw = parseHospitalClockMs(h.fecha_fin_str);
                const habClean = h.nombre_habitacion || '';
                const camaClean = h.nombre_cama || '';
                const dedupKey = `${habClean}|${camaClean}|${tStart}|${tEndRaw || ''}`;
                if (dedupTramosKey.has(dedupKey)) continue;
                dedupTramosKey.add(dedupKey);
                parsedTramos.push({
                    hab: habClean,
                    cama: camaClean,
                    servicio: h.hosp_servicio || r.servicio_salus,
                    startMs: tStart,
                    endMsRaw: tEndRaw
                });
            }
            parsedTramos.sort((a, b) => a.startMs - b.startMs);

            // Resolver fin de cada tramo si viene abierto en historial
            const resolvedTramos = [];
            if (parsedTramos.length > 0 && parsedTramos.some(t => t.hab)) {
                for (let i = 0; i < parsedTramos.length; i++) {
                    const cur = parsedTramos[i];
                    if (!cur.hab) continue;
                    const nextStart = i + 1 < parsedTramos.length ? parsedTramos[i + 1].startMs : null;
                    let endMs = cur.endMsRaw || nextStart || effectiveEndMs;
                    if (altaMsRaw && endMs > altaMsRaw) endMs = altaMsRaw;
                    if (endMs < cur.startMs) endMs = cur.startMs;
                    const cls = classifyUnit(cur.hab, cur.cama);
                    resolvedTramos.push({
                        unidad: cls.unidad,
                        tipo: cls.tipo,
                        startMs: cur.startMs,
                        endMs,
                        horas: Math.round(((endMs - cur.startMs) / HOUR_MS) * 100) / 100
                    });
                }
            } else {
                // Fallback a la habitación cabecera de TABLEAU_Admisiones
                const cls = classifyUnit(r.habitacion_salus, '');
                resolvedTramos.push({
                    unidad: cls.unidad,
                    tipo: cls.tipo,
                    startMs: ingMs,
                    endMs: Math.max(ingMs, effectiveEndMs),
                    horas: Math.round(rawHours * 100) / 100
                });
            }

            const boxesSrSet = new Set();
            const camasPisoSet = new Set();
            let hasSinHab = false;
            let hasCriticos = false;

            for (const t of resolvedTramos) {
                if (t.tipo === 'SHOCK_ROOM_BOX') boxesSrSet.add(t.unidad);
                else if (t.tipo === 'PISO_CLINICO') camasPisoSet.add(t.unidad);
                else if (t.tipo === 'CRITICOS_UCI') {
                    camasPisoSet.add(t.unidad);
                    hasCriticos = true;
                } else if (t.tipo === 'CAMA_AUXILIAR') {
                    // Si nunca pisó un Box SR y sólo estuvo en cama auxiliar/piso, contarlo en piso
                    if (!resolvedTramos.some(x => x.tipo === 'SHOCK_ROOM_BOX')) {
                        camasPisoSet.add(t.unidad);
                    }
                } else if (t.tipo === 'SIN_HABITACION') {
                    hasSinHab = true;
                }
            }

            const boxesSr = Array.from(boxesSrSet);
            const camasPiso = Array.from(camasPisoSet);

            let regimen = 'SHOCK_ROOM';
            if (boxesSr.length > 0 && camasPiso.length > 0) regimen = 'MIXTO_SR_PISO';
            else if (boxesSr.length > 0) regimen = 'SHOCK_ROOM';
            else if (hasCriticos && camasPiso.length > 0) regimen = 'CRITICOS_UCI';
            else if (camasPiso.length > 0) regimen = 'PISO_CLINICO';
            else regimen = 'SIN_HABITACION';

            const servicioNorm = normalizeText(r.servicio_salus);
            const numAdmNorm = normalizeText(r.numero_admision);
            const motivoAltaNorm = normalizeText(r.motivo_alta);
            const procesoNorm = normalizeText(r.proceso_salus);

            // ── MOTOR DE AUDITORÍA DE INCONSISTENCIAS SALUS ──
            let tieneInconsistencia = false;
            let inconsistenciaCodigo = 'OK';
            let inconsistenciaSeveridad = 'ok';
            let inconsistenciaDetalle = null;
            let incluidaEnPresupuesto = true;

            const daysSinceLastVisit = ultimaVisitaMs ? (nowClockMs - ultimaVisitaMs) / DAY_MS : 999;

            if (servicioNorm === 'CHEQUEO' || numAdmNorm.startsWith('A-CE')) {
                tieneInconsistencia = true;
                inconsistenciaCodigo = 'SERVICIO_INCORRECTO_CHEQUEO';
                inconsistenciaSeveridad = 'critical';
                incluidaEnPresupuesto = false;
                inconsistenciaDetalle = `Circuito ambulatorio (${r.servicio_salus || 'CHEQUEO'} · ${r.numero_admision}) asignado por error a Dra. Paola García. Excluido de Guardia Clínica.`;
            } else if (
                motivoAltaNorm.includes('SUSPENDID') ||
                (regimen === 'SIN_HABITACION' && !isOpen && rawHours < 1.0 && visitasHcCount === 0)
            ) {
                tieneInconsistencia = true;
                inconsistenciaCodigo = 'INTERNACION_SUSPENDIDA';
                inconsistenciaSeveridad = 'warning';
                incluidaEnPresupuesto = false;
                inconsistenciaDetalle = `Internación abortada/suspendida (${r.motivo_alta || 'Sin atención en HC'}, ${(rawHours * 60).toFixed(0)} min) sin ocupar box ni cama. No suma horas de ocupación.`;
            } else if (
                isOpen && (
                    ((regimen === 'SHOCK_ROOM' || regimen === 'SIN_HABITACION') && rawHours > 48) ||
                    (rawHours > 24 * 45 && daysSinceLastVisit > 14)
                )
            ) {
                tieneInconsistencia = true;
                inconsistenciaCodigo = 'ABIERTA_OLVIDADA_SIN_ALTA';
                inconsistenciaSeveridad = 'critical';
                incluidaEnPresupuesto = false;
                inconsistenciaDetalle = `Admisión abierta sin alta administrativa en SALUS desde ${r.fecha_ingreso_str?.slice(0, 10)} (${rawHours.toFixed(1)} hs acumuladas). Excluida para evitar inflar el presupuesto; requiere cierre administrativo.`;
            } else if (regimen === 'SIN_HABITACION') {
                tieneInconsistencia = true;
                inconsistenciaCodigo = 'SIN_HABITACION_CON_ATENCION';
                inconsistenciaSeveridad = 'warning';
                incluidaEnPresupuesto = true;
                inconsistenciaDetalle = `Atención clínica real comprobada (${r.proceso_salus || `${visitasHcCount} registros en HC`}, ${rawHours.toFixed(2)} hs) donde omitieron asignar el Box físico antes del alta.`;
            } else if (regimen === 'SHOCK_ROOM' && servicioNorm === 'INTERNACION CLINICA') {
                tieneInconsistencia = true;
                inconsistenciaCodigo = 'SERVICIO_MAL_IMPUTADO_SR';
                inconsistenciaSeveridad = 'info';
                incluidaEnPresupuesto = true;
                inconsistenciaDetalle = `Estancia exclusiva en ${boxesSr.join(', ')} (${rawHours.toFixed(2)} hs) cargada con Servicio 'INTERNACION CLINICA' en vez de 'SHOCK ROOM'. Contabilizada correctamente en Shock Room y depurada de Piso.`;
            }

            // Calcular horas presupuestarias exactas y rebanar por día calendario [00:00 - 24:00]
            let horasSr = 0;
            let horasPiso = 0;
            let horasSinBox = 0;

            if (incluidaEnPresupuesto) {
                for (const t of resolvedTramos) {
                    if (t.endMs <= t.startMs) continue;
                    const durH = (t.endMs - t.startMs) / HOUR_MS;

                    if (t.tipo === 'SHOCK_ROOM_BOX') horasSr += durH;
                    else if (t.tipo === 'SIN_HABITACION') horasSinBox += Math.min(durH, 48); // tope prudencial 48h
                    else horasPiso += durH;

                    // Rebanar el tramo día por día [00:00:00 - 24:00:00]
                    let cursorMs = t.startMs;
                    const limitEndMs = t.tipo === 'SIN_HABITACION'
                        ? Math.min(t.endMs, t.startMs + 48 * HOUR_MS)
                        : t.endMs;

                    let guard = 0;
                    while (cursorMs < limitEndMs && guard < 400) {
                        guard++;
                        const dayIndex = Math.floor(cursorMs / DAY_MS);
                        const dayStartMs = dayIndex * DAY_MS;
                        const dayEndMs = dayStartMs + DAY_MS;
                        const sliceEndMs = Math.min(limitEndMs, dayEndMs);
                        const fechaStr = clockMsToYMD(dayStartMs);

                        const unidadDestino =
                            t.tipo === 'SHOCK_ROOM_BOX'
                                ? t.unidad
                                : t.tipo === 'SIN_HABITACION'
                                    ? 'SIN_BOX_CON_ATENCION'
                                    : 'PISO_PAOLA_GARCIA';

                        const tipoDestino =
                            t.tipo === 'SHOCK_ROOM_BOX'
                                ? 'SHOCK_ROOM_BOX'
                                : t.tipo === 'SIN_HABITACION'
                                    ? 'SIN_BOX_AUDITADO'
                                    : 'PISO_CLINICO';

                        pushDailySlice({
                            fecha: fechaStr,
                            unidad: unidadDestino,
                            tipoUnidad: tipoDestino,
                            idAdmision: idAdm,
                            numeroAdmision: r.numero_admision,
                            paciente: r.paciente || 'SIN NOMBRE',
                            nhc: r.nhc,
                            obraSocial: r.obra_social || 'PARTICULAR',
                            servicioSalus: r.servicio_salus,
                            sliceStartMs: cursorMs,
                            sliceEndMs,
                            dayStartMs
                        });

                        cursorMs = sliceEndMs;
                    }
                }
            }

            horasSr = Math.round(horasSr * 100) / 100;
            horasPiso = Math.round(horasPiso * 100) / 100;
            horasSinBox = Math.round(horasSinBox * 100) / 100;
            const horasPresupuestoTotal = Math.round((horasSr + horasPiso + horasSinBox) * 100) / 100;

            // Conversión proporcional exacta aprobada: Horas / 24 = Días Proporcionales
            const diasPropSr = Math.round((horasSr / 24) * 10000) / 10000;
            const diasPropPiso = Math.round((horasPiso / 24) * 10000) / 10000;
            const diasPropSinBox = Math.round((horasSinBox / 24) * 10000) / 10000;
            const diasPropTotal = Math.round((horasPresupuestoTotal / 24) * 10000) / 10000;

            const diasTradicional = incluidaEnPresupuesto
                ? calcDiasConteoTradicionalPaciente(ingMs, effectiveEndMs)
                : 0;

            const habInicial = resolvedTramos[0]?.unidad !== 'SIN_HABITACION' ? resolvedTramos[0]?.unidad : null;
            const habFinal = resolvedTramos[resolvedTramos.length - 1]?.unidad !== 'SIN_HABITACION'
                ? resolvedTramos[resolvedTramos.length - 1]?.unidad
                : null;

            const fechaIngresoDate = clockMsToYMD(ingMs);

            processedAdmissions.push({
                id_admision: idAdm,
                numero_admision: r.numero_admision || null,
                serie_admision: r.serie_admision || (numAdmNorm.startsWith('SR') ? 'SHOCK ROOM' : numAdmNorm.startsWith('I') ? 'INTERNADO' : 'OTRA'),
                dias_salus: r.dias_salus !== null && r.dias_salus !== undefined ? Number(r.dias_salus) : null,
                edad_salus: r.edad_salus !== null && r.edad_salus !== undefined ? Number(r.edad_salus) : null,
                procedencia_salus: r.procedencia_salus || null,
                paciente: r.paciente || 'SIN NOMBRE',
                nhc: r.nhc || null,
                dni: r.dni || null,
                obra_social: r.obra_social || 'PARTICULAR',
                doctor_cabecera: r.doctor_cabecera || 'GARCIA, PAOLA GUADALUPE',
                servicio_salus: r.servicio_salus || null,
                especialidad_salus: r.especialidad_salus || null,
                proceso_salus: r.proceso_salus || null,
                motivo_alta: r.motivo_alta || null,
                estado_salus: isOpen ? 'ACTIVA' : (r.estado_salus || 'ALTA'),
                fecha_ingreso: clockMsToIsoAr(ingMs),
                fecha_alta: altaMsRaw ? clockMsToIsoAr(altaMsRaw) : null,
                periodo: fechaIngresoDate.slice(0, 7),
                fecha_ingreso_date: fechaIngresoDate,
                habitacion_salus: r.habitacion_salus || null,
                habitacion_inicial: habInicial,
                habitacion_final: habFinal,
                boxes_sr_utilizados: boxesSr,
                camas_piso_utilizadas: camasPiso,
                regimen_ubicacion: regimen,
                horas_brutas_salus: Math.round(rawHours * 100) / 100,
                horas_shock_room: horasSr,
                dias_proporcionales_sr: diasPropSr,
                horas_piso: horasPiso,
                dias_proporcionales_piso: diasPropPiso,
                horas_sin_box_auditadas: horasSinBox,
                dias_proporcionales_sin_box: diasPropSinBox,
                horas_presupuesto_total: horasPresupuestoTotal,
                dias_proporcionales_total: diasPropTotal,
                dias_cama_tradicional: diasTradicional,
                tiene_inconsistencia: tieneInconsistencia,
                inconsistencia_codigo: inconsistenciaCodigo,
                inconsistencia_severidad: inconsistenciaSeveridad,
                inconsistencia_detalle: inconsistenciaDetalle,
                incluida_en_presupuesto: incluidaEnPresupuesto,
                visitas_hc_count: visitasHcCount,
                tiene_ficha_557: Boolean(idVisita557),
                id_visita_557: idVisita557,
                tramos_json: resolvedTramos.map(t => ({
                    unidad: t.unidad,
                    tipo: t.tipo,
                    inicio: clockMsToIsoAr(t.startMs),
                    fin: clockMsToIsoAr(t.endMs),
                    horas: t.horas,
                    dias_prop: Math.round((t.horas / 24) * 10000) / 10000
                })),
                updated_at: nowIso
            });
        }

        // 5. Consolidar Matriz Diaria Proporcional y detectar solapamientos físicos en Boxes SR
        const overlappedAdmIds = new Map(); // idAdmision -> { box, fecha, minSolapados }
        const dailyRows = [];

        for (const b of dailyBuckets.values()) {
            const pacientesDistintos = b.admIds.size;
            const { netMs, grossMs, overlapMs } = mergeIntervals(b.intervals);

            // En Shock Room un box físico tiene 24 hs máximas por día:
            // Días Proporcionales = Horas Netas Ocupadas / 24 (ej. 12 hs = 0.50 días sin importar cuántos pacientes pasaron)
            const isPhysicalBox = b.tipo_unidad === 'SHOCK_ROOM_BOX';
            const horasBrutas = Math.round((grossMs / HOUR_MS) * 100) / 100;
            const horasNetas = isPhysicalBox
                ? Math.min(24, Math.round((netMs / HOUR_MS) * 100) / 100)
                : Math.round((grossMs / HOUR_MS) * 100) / 100; // en bolsa Piso o Sin Box hay múltiples camas posibles, no fusionamos entre pacientes distintos
            const minSolapados = isPhysicalBox ? Math.round((overlapMs / 60000) * 10) / 10 : 0;

            // Si hubo solapamiento significativo (>= 5 min) en un box físico de Shock Room, marcar las admisiones involucradas si estaban en 'OK'
            if (isPhysicalBox && minSolapados >= 5 && b.intervals.length > 1) {
                const sortedIv = [...b.intervals].sort((x, y) => x.startMs - y.startMs);
                for (let i = 1; i < sortedIv.length; i++) {
                    const prev = sortedIv[i - 1];
                    const cur = sortedIv[i];
                    if (cur.startMs < prev.endMs) {
                        const ovMin = Math.round((Math.min(prev.endMs, cur.endMs) - cur.startMs) / 60000);
                        if (ovMin >= 5) {
                            overlappedAdmIds.set(cur.idAdmision, { box: b.unidad, fecha: b.fecha, minSolapados: ovMin });
                        }
                    }
                }
            }

            const diasProporcionales = Math.round((horasNetas / 24) * 10000) / 10000;
            const diasConteoTradicional = pacientesDistintos; // Conteo entero tradicional por paciente/día en la unidad
            const pctOcupacion = isPhysicalBox
                ? Math.min(100, Math.round(((horasNetas / 24) * 100) * 100) / 100)
                : Math.round(((horasNetas / 24) * 100) * 100) / 100;

            const sortedTramosDia = b.tramosDia.sort((x, y) => x.min_inicio - y.min_inicio);

            dailyRows.push({
                fecha: b.fecha,
                periodo: b.periodo,
                unidad: b.unidad,
                tipo_unidad: b.tipo_unidad,
                horas_disponibles: 24,
                pacientes_distintos: pacientesDistintos,
                horas_brutas_pacientes: horasBrutas,
                horas_netas_ocupadas: horasNetas,
                minutos_solapados: minSolapados,
                dias_proporcionales: diasProporcionales,
                dias_conteo_tradicional: diasConteoTradicional,
                porcentaje_ocupacion: pctOcupacion,
                detalle_tramos_dia: sortedTramosDia,
                updated_at: nowIso
            });
        }

        // Anotar aviso informativo de solapamiento horario en aquellas admisiones que no tenían otra inconsistencia más severa
        for (const adm of processedAdmissions) {
            const ov = overlappedAdmIds.get(adm.id_admision);
            if (ov && adm.inconsistencia_codigo === 'OK') {
                adm.tiene_inconsistencia = true;
                adm.inconsistencia_codigo = 'SOLAPAMIENTO_HORARIO_BOX';
                adm.inconsistencia_severidad = 'info';
                adm.inconsistencia_detalle = `Solapamiento administrativo de ${ov.minSolapados} min en ${ov.box} el ${ov.fecha} con otro paciente (minutos deduplicados sobre el día proporcional del box).`;
            }
        }

        dailyRows.sort((a, b) => b.fecha.localeCompare(a.fecha) || a.unidad.localeCompare(b.unidad));

        // 6. Guardar en Supabase (reemplazo limpio desde startYear)
        console.log(`☁️ Subiendo ${processedAdmissions.length} admisiones nominales y ${dailyRows.length} registros diarios de ocupación proporcional a Supabase...`);

        const { error: delAdmErr } = await supabase
            .from('gob_guardia_admisiones_paola')
            .delete()
            .gte('fecha_ingreso_date', `${startYear}-01-01`);
        if (delAdmErr) throw new Error(`Error limpiando gob_guardia_admisiones_paola: ${delAdmErr.message}`);

        const BATCH = 400;
        for (let i = 0; i < processedAdmissions.length; i += BATCH) {
            const chunk = processedAdmissions.slice(i, i + BATCH);
            const { error } = await supabase
                .from('gob_guardia_admisiones_paola')
                .upsert(chunk, { onConflict: 'id_admision' });
            if (error) throw new Error(`Error insertando admisiones lote ${i}: ${error.message}`);
        }

        const { error: delOcupErr } = await supabase
            .from('gob_guardia_ocupacion_diaria_box')
            .delete()
            .gte('fecha', `${startYear}-01-01`);
        if (delOcupErr) throw new Error(`Error limpiando gob_guardia_ocupacion_diaria_box: ${delOcupErr.message}`);

        for (let i = 0; i < dailyRows.length; i += BATCH) {
            const chunk = dailyRows.slice(i, i + BATCH);
            const { error } = await supabase
                .from('gob_guardia_ocupacion_diaria_box')
                .upsert(chunk, { onConflict: 'fecha,unidad' });
            if (error) throw new Error(`Error insertando ocupación diaria lote ${i}: ${error.message}`);
        }

        // Resumen de auditoría 2026 en consola
        const adm2026 = processedAdmissions.filter(a => a.periodo.startsWith('2026'));
        const srDaily2026 = dailyRows.filter(d => d.periodo.startsWith('2026') && d.tipo_unidad === 'SHOCK_ROOM_BOX');
        const totalHorasNetasSr2026 = srDaily2026.reduce((s, d) => s + Number(d.horas_netas_ocupadas || 0), 0);
        const totalDiasPropSr2026 = srDaily2026.reduce((s, d) => s + Number(d.dias_proporcionales || 0), 0);
        const totalDiasTradSr2026 = srDaily2026.reduce((s, d) => s + Number(d.dias_conteo_tradicional || 0), 0);
        const diasRotacionMultiple = srDaily2026.filter(d => d.pacientes_distintos >= 2).length;

        const stats2026 = {
            total_admisiones_2026: adm2026.length,
            incluidas_presupuesto_2026: adm2026.filter(a => a.incluida_en_presupuesto).length,
            excluidas_auditoria_2026: adm2026.filter(a => !a.incluida_en_presupuesto).length,
            horas_netas_sr_2026: Math.round(totalHorasNetasSr2026 * 100) / 100,
            dias_proporcionales_sr_2026: Math.round(totalDiasPropSr2026 * 100) / 100,
            dias_tradicional_distorsionado_sr_2026: totalDiasTradSr2026,
            eventos_rotacion_multiple_box_dia_2026: diasRotacionMultiple,
            inconsistencias_por_tipo_2026: adm2026.reduce((acc, a) => {
                if (a.tiene_inconsistencia) {
                    acc[a.inconsistencia_codigo] = (acc[a.inconsistencia_codigo] || 0) + 1;
                }
                return acc;
            }, {}),
            ultima_actualizacion: nowIso
        };

        console.log('📊 Resumen 2026 Guardia Clínica (Dra. Paola García):', JSON.stringify(stats2026, null, 2));
        return {
            admisionesCount: processedAdmissions.length,
            dailyCount: dailyRows.length,
            stats2026
        };
    } finally {
        await pool.close();
    }
}

if (process.argv[1] && process.argv[1].endsWith('sync_guardia_admisiones_paola.mjs')) {
    syncGuardiaAdmisionesPaola({ startYear: 2025 })
        .then(() => {
            console.log('🏁 Sincronización de Admisiones y Ocupación Proporcional de Guardia Clínica finalizada.');
            process.exit(0);
        })
        .catch(err => {
            console.error('❌ Error fatal en sync_guardia_admisiones_paola:', err);
            process.exit(1);
        });
}
