import sql from 'mssql';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

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
        requestTimeout: 180000,
        connectionTimeout: 25000,
        tdsVersion: '7_4',
    },
    pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
};

const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function cleanKey(val) {
    if (!val) return '';
    return String(val).replace(/[^0-9A-Za-z]/g, '').replace(/^0+/, '').toUpperCase();
}

function parseDatePart(val) {
    if (!val) return null;
    if (val instanceof Date && !isNaN(val.getTime())) {
        const y = val.getUTCFullYear();
        const m = String(val.getUTCMonth() + 1).padStart(2, '0');
        const d = String(val.getUTCDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    const str = String(val).trim();
    if (!str) return null;
    const first = str.split(' ')[0];
    if (first.includes('/')) {
        const [d, m, y] = first.split('/');
        if (y && m && d) {
            const yy = y.length === 2 ? `20${y}` : y;
            return `${yy}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        }
    }
    if (/^\d{4}-\d{2}-\d{2}/.test(first)) return first.slice(0, 10);
    return null;
}

function parseTimePart(val) {
    if (!val) return null;
    if (val instanceof Date && !isNaN(val.getTime())) {
        const hh = String(val.getUTCHours()).padStart(2, '0');
        const mm = String(val.getUTCMinutes()).padStart(2, '0');
        const ss = String(val.getUTCSeconds()).padStart(2, '0');
        return `${hh}:${mm}:${ss}`;
    }
    const str = String(val).trim();
    const match = str.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (!match) return null;
    return `${match[1].padStart(2, '0')}:${match[2]}:${(match[3] || '00').padStart(2, '0')}`;
}

/**
 * Combina fecha y hora de SALUS (siempre hora local Argentina UTC-3) en un objeto Date confiable
 */
function buildArgDate(dateVal, timeVal = null) {
    // Si dateVal ya es Date con hora real y no viene timeVal
    if (dateVal instanceof Date && !isNaN(dateVal.getTime()) && !timeVal) {
        const y = dateVal.getUTCFullYear();
        const m = String(dateVal.getUTCMonth() + 1).padStart(2, '0');
        const d = String(dateVal.getUTCDate()).padStart(2, '0');
        const hh = String(dateVal.getUTCHours()).padStart(2, '0');
        const mm = String(dateVal.getUTCMinutes()).padStart(2, '0');
        const ss = String(dateVal.getUTCSeconds()).padStart(2, '0');
        return new Date(`${y}-${m}-${d}T${hh}:${mm}:${ss}-03:00`);
    }
    const dPart = parseDatePart(dateVal);
    if (!dPart) return null;
    const tPart = parseTimePart(timeVal) || (typeof dateVal === 'string' ? parseTimePart(dateVal) : null) || '00:00:00';
    const dt = new Date(`${dPart}T${tPart}-03:00`);
    return isNaN(dt.getTime()) ? null : dt;
}

function diffMinutes(a, b) {
    if (!a || !b) return null;
    const ms = b.getTime() - a.getTime();
    return Math.round((ms / 60000) * 10) / 10;
}

function getFranjaArg(dt) {
    if (!dt) return '08 a 14';
    // Hora local Argentina
    const arg = new Date(dt.getTime() - 3 * 3600000);
    const h = arg.getUTCHours();
    if (h >= 8 && h < 14) return '08 a 14';
    if (h >= 14 && h < 22) return '14 a 22';
    return '22 a 08';
}

function getDiaSemanaArg(dt) {
    if (!dt) return 'Lunes';
    const arg = new Date(dt.getTime() - 3 * 3600000);
    return DIAS_SEMANA[arg.getUTCDay()];
}

function getPeriodoArg(dt) {
    if (!dt) return null;
    const arg = new Date(dt.getTime() - 3 * 3600000);
    const y = arg.getUTCFullYear();
    const m = String(arg.getUTCMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
}

function getDateStrArg(dt) {
    if (!dt) return null;
    const arg = new Date(dt.getTime() - 3 * 3600000);
    const y = arg.getUTCFullYear();
    const m = String(arg.getUTCMonth() + 1).padStart(2, '0');
    const d = String(arg.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function calcPercentile(arr, p) {
    if (!arr || arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)));
    return Math.round(sorted[idx] * 10) / 10;
}

function calcAvg(arr) {
    if (!arr || arr.length === 0) return 0;
    return Math.round((arr.reduce((s, v) => s + v, 0) / arr.length) * 10) / 10;
}

export async function syncGuardiaGGO({ startYear = 2025, fastSync = false } = {}) {
    console.log(`\n🤰 [SYNC GUARDIA GINECO-OBSTÉTRICA (GGO)] Iniciando extracción desde SALUS (${fastSync ? 'últimos 45 días' : `${startYear}–actualidad`})...`);
    const pool = await sql.connect(SQL_CONFIG);
    const now = new Date();
    const todayStr = getDateStrArg(now);

    const dateStartSql = fastSync
        ? "DATEADD(DAY, -45, CAST(GETDATE() AS DATE))"
        : `'${startYear}-01-01'`;

    try {
        // 1. Extraer todas las consultas de GUARDIAS GINECOLOGIA
        console.log('📥 [1/4] Consultando VLISE_Visitas (GUARDIAS GINECOLOGIA)...');
        const ggoRes = await pool.request().query(`
            SELECT
                V.idVisita,
                V.NHC,
                V.NIF AS DNI,
                V.Paciente,
                V.Cliente,
                V.[Tipo Visita] AS TipoVisita,
                V.Responsable AS Medico,
                V.Asistencia,
                V.IdHospitalizacion,
                V.[Fecha Visita] AS FechaVisita,
                V.[Hora Inicio Visita] AS HoraInicioVisita,
                V.[Hora Fin Visita] AS HoraFinVisita,
                V.[Fecha Entrada Real] AS FechaEntradaReal,
                V.[Hora Entrada Real] AS HoraEntradaReal,
                V.[Fecha Hora Entrada] AS FechaHoraEntrada,
                V.[Fecha Salida Real] AS FechaSalidaReal,
                V.[Hora Salida Real] AS HoraSalidaReal,
                V.[Fecha Hora Salida] AS FechaHoraSalida,
                V.[Fecha Hora Creacion] AS FechaHoraCreacion
            FROM [SALUS].[dbo].[VLISE_Visitas] V WITH (NOLOCK)
            WHERE V.Agenda = 'GUARDIAS GINECOLOGIA'
              AND CAST(V.[Fecha Visita] AS DATE) >= ${dateStartSql}
              AND CAST(V.[Fecha Visita] AS DATE) <= CAST(GETDATE() AS DATE)
              AND ISNULL(V.Asistencia, '') NOT IN ('Ausente', 'Anulada', 'Cancelada')
            ORDER BY V.[Fecha Visita] ASC
        `);
        const ggoRows = ggoRes.recordset || [];
        console.log(`   ✅ ${ggoRows.length} consultas GGO extraídas.`);

        // 2. Extraer GUARDIAS ECOGRAFIAS para asentar cuándo una consulta GGO termina en Ecografía de Guardia
        console.log('📥 [2/4] Consultando VLISE_Visitas (GUARDIAS ECOGRAFIAS)...');
        const ecoRes = await pool.request().query(`
            SELECT
                V.idVisita,
                V.NHC,
                V.NIF AS DNI,
                V.[Tipo Visita] AS TipoVisita,
                V.[Fecha Visita] AS FechaVisita,
                V.[Hora Inicio Visita] AS HoraInicioVisita,
                V.[Fecha Entrada Real] AS FechaEntradaReal,
                V.[Hora Entrada Real] AS HoraEntradaReal,
                V.[Fecha Hora Entrada] AS FechaHoraEntrada
            FROM [SALUS].[dbo].[VLISE_Visitas] V WITH (NOLOCK)
            WHERE V.Agenda = 'GUARDIAS ECOGRAFIAS'
              AND CAST(V.[Fecha Visita] AS DATE) >= ${dateStartSql}
              AND ISNULL(V.Asistencia, '') NOT IN ('Ausente', 'Anulada', 'Cancelada')
        `);
        const ecoByKey = new Map();
        for (const e of (ecoRes.recordset || [])) {
            const dtEco = buildArgDate(e.FechaEntradaReal || e.FechaVisita, e.HoraEntradaReal || e.HoraInicioVisita) || buildArgDate(e.FechaHoraEntrada);
            if (!dtEco) continue;
            const entry = { dt: dtEco, tipo: (e.TipoVisita || 'ECOGRAFÍA DE GUARDIA').trim() };
            for (const k of [cleanKey(e.NHC), cleanKey(e.DNI)]) {
                if (!k) continue;
                if (!ecoByKey.has(k)) ecoByKey.set(k, []);
                ecoByKey.get(k).push(entry);
            }
        }
        console.log(`   ✅ ${(ecoRes.recordset || []).length} ecografías de guardia indexadas.`);

        // 3. Extraer TABLEAU_Admisiones para cruzar pases a internación y T4 (Admisión pre-quirúrgica)
        console.log('📥 [3/4] Consultando TABLEAU_Admisiones...');
        const admRes = await pool.request().query(`
            SELECT
                idAdmision,
                LTRIM(RTRIM([Número admisión])) AS numero_admision,
                NHC,
                NIF AS DNI,
                [Fecha ingreso] AS fecha_ingreso,
                Servicio,
                Especialidad
            FROM [SALUS].[dbo].[TABLEAU_Admisiones] WITH (NOLOCK)
            WHERE [Fecha ingreso] >= ${dateStartSql}
              AND ISNULL(Estado, '') NOT IN ('ANULADA', 'CANCELADA')
        `);
        const admById = new Map();
        const admByKey = new Map();
        for (const a of (admRes.recordset || [])) {
            const dtIng = buildArgDate(a.fecha_ingreso);
            if (!dtIng) continue;
            const entry = {
                idAdmision: Number(a.idAdmision),
                numero_admision: a.numero_admision || null,
                dtIng,
                servicio: a.Servicio || '',
                especialidad: a.Especialidad || '',
            };
            if (entry.idAdmision) admById.set(entry.idAdmision, entry);
            for (const k of [cleanKey(a.NHC), cleanKey(a.DNI)]) {
                if (!k) continue;
                if (!admByKey.has(k)) admByKey.set(k, []);
                admByKey.get(k).push(entry);
            }
        }
        console.log(`   ✅ ${admById.size} admisiones indexadas.`);

        // 4. Extraer TABLEAU_Cirugias (ventana desde startDate) para cruzar GGO -> Quirófano (0-48h)
        console.log('📥 [4/4] Consultando TABLEAU_Cirugias...');
        const cxRes = await pool.request().query(`
            SELECT
                TC.[Nombre Paciente] AS Paciente,
                TC.DNI,
                TC.Especialidad,
                TC.[Nombre cirugía] AS NombreCirugia,
                TC.Estado,
                TC.Tipo,
                TC.Cirujano,
                TC.[Fecha realización] AS FechaRealizacion,
                TC.[Hora Inicio cirugía] AS HoraInicioCx,
                TC.[Hora fin cirugía] AS HoraFinCx,
                TC.[Fecha programada] AS FechaProgramada,
                V.NHC AS VisitaNHC,
                V.IdHospitalizacion
            FROM [SALUS].[dbo].[TABLEAU_Cirugias] TC WITH (NOLOCK)
            LEFT JOIN [SALUS].[dbo].[VLISE_Visitas] V WITH (NOLOCK) ON V.idVisita = TC.idvisita
            WHERE TC.[Fecha realización] IS NOT NULL
              AND LEN(TC.[Fecha realización]) >= 10
              AND CONVERT(DATE, LEFT(TC.[Fecha realización], 10), 103) >= ${dateStartSql}
              AND ISNULL(TC.Estado, '') NOT IN ('Suspendida', 'SUSPENDIDA', 'Anulada', 'ANULADA', 'Cancelada', 'CANCELADA')
        `);
        const cxByKey = new Map();
        for (const c of (cxRes.recordset || [])) {
            const dtInicio = buildArgDate(c.FechaRealizacion, c.HoraInicioCx);
            if (!dtInicio) continue;
            let dtFin = c.HoraFinCx ? buildArgDate(c.FechaRealizacion, c.HoraFinCx) : null;
            if (dtFin && dtFin < dtInicio) {
                dtFin = new Date(dtFin.getTime() + 86400000); // cirugía que cruzó medianoche
            }
            const estUpper = String(c.Estado || '').toUpperCase();
            const tipoUpper = String(c.Tipo || '').toUpperCase();
            const esUrgencia = estUpper.includes('URGENCIA') || estUpper.includes('NO PROGRAMADA') || tipoUpper.includes('URG');
            const entry = {
                dtInicio,
                dtFin,
                nombreCirugia: (c.NombreCirugia || 'CIRUGÍA').trim(),
                especialidad: (c.Especialidad || 'GINECOLOGIA').trim(),
                cirujano: (c.Cirujano || 'SIN CIRUJANO').trim(),
                estado: (c.Estado || '').trim(),
                esUrgencia,
                idHospitalizacion: c.IdHospitalizacion ? Number(c.IdHospitalizacion) : null,
            };
            for (const k of [cleanKey(c.DNI), cleanKey(c.VisitaNHC)]) {
                if (!k) continue;
                if (!cxByKey.has(k)) cxByKey.set(k, []);
                cxByKey.get(k).push(entry);
            }
        }
        console.log(`   ✅ ${(cxRes.recordset || []).length} cirugías indexadas.`);

        // 5. Procesar cada visita GGO: tiempos, ecografía de guardia, reconsulta 72h, internación y cuello de botella Quirófano
        const visitsByPatient = new Map(); // key -> array of { idVisita, t0 }
        const parsedVisits = [];

        for (const v of ggoRows) {
            const t0 = buildArgDate(v.FechaEntradaReal || v.FechaVisita, v.HoraEntradaReal)
                || buildArgDate(v.FechaHoraEntrada)
                || buildArgDate(v.FechaVisita, v.HoraInicioVisita);
            if (!t0) continue;

            const periodo = getPeriodoArg(t0);
            const fechaGgo = getDateStrArg(t0);
            if (!periodo || fechaGgo > todayStr) continue;

            let t2 = buildArgDate(v.FechaVisita, v.HoraInicioVisita) || buildArgDate(v.FechaHoraCreacion);
            if (t2 && t2 < t0) {
                // Si el turno se marcó minutos antes o en medianoche
                if ((t0.getTime() - t2.getTime()) <= 15 * 60000) t2 = t0;
                else if ((t0.getTime() - t2.getTime()) > 12 * 3600000) t2 = new Date(t2.getTime() + 86400000);
                else t2 = t0;
            }

            let t3 = buildArgDate(v.FechaSalidaReal || v.FechaVisita, v.HoraSalidaReal)
                || buildArgDate(v.FechaHoraSalida)
                || (v.HoraFinVisita ? buildArgDate(v.FechaVisita, v.HoraFinVisita) : null);
            if (t3 && t2 && t3 < t2) {
                if ((t2.getTime() - t3.getTime()) > 12 * 3600000) t3 = new Date(t3.getTime() + 86400000);
                else t3 = null;
            }

            const minEspera = t2 ? diffMinutes(t0, t2) : null;
            const validEspera = (minEspera !== null && minEspera >= 0 && minEspera <= 480) ? minEspera : null;

            const minAtencion = (t2 && t3) ? diffMinutes(t2, t3) : null;
            const validAtencion = (minAtencion !== null && minAtencion >= 0 && minAtencion <= 480) ? minAtencion : null;

            const minPerm = t3 ? diffMinutes(t0, t3) : null;
            const validPerm = (minPerm !== null && minPerm >= 0 && minPerm <= 720) ? minPerm : null;

            const tipoUpper = String(v.TipoVisita || '').toUpperCase();
            const rama = (tipoUpper.includes('OBST') || tipoUpper.includes('PARTO') || tipoUpper.includes('CESAREA'))
                ? 'OBSTETRICIA'
                : 'GINECOLOGIA';
            const prioridad = tipoUpper.includes('(N1)') ? 'N1' : tipoUpper.includes('(N2)') ? 'N2' : 'N3';

            const kNhc = cleanKey(v.NHC);
            const kDni = cleanKey(v.DNI);
            const patKeys = [kNhc, kDni].filter(Boolean);

            // Cruce con GUARDIAS ECOGRAFIAS (-30 min a +12 hs)
            let ecoMatch = null;
            for (const pk of patKeys) {
                const list = ecoByKey.get(pk);
                if (!list) continue;
                for (const ec of list) {
                    const dm = diffMinutes(t0, ec.dt);
                    if (dm !== null && dm >= -30 && dm <= 720) {
                        if (!ecoMatch || Math.abs(dm) < Math.abs(ecoMatch.dm)) {
                            ecoMatch = { ...ec, dm: Math.max(0, dm) };
                        }
                    }
                }
            }

            // Cruce con TABLEAU_Admisiones (IdHospitalizacion o ventana -2h a +24h)
            let admMatch = v.IdHospitalizacion ? admById.get(Number(v.IdHospitalizacion)) || null : null;
            if (!admMatch) {
                for (const pk of patKeys) {
                    const list = admByKey.get(pk);
                    if (!list) continue;
                    for (const ad of list) {
                        const dm = diffMinutes(t0, ad.dtIng);
                        if (dm !== null && dm >= -60 && dm <= 1440) {
                            if (!admMatch || Math.abs(dm) < Math.abs(diffMinutes(t0, admMatch.dtIng))) {
                                admMatch = ad;
                            }
                        }
                    }
                }
            }

            // Cruce con TABLEAU_Cirugias (ventana 0 a 48h desde T0)
            let cxMatch = null;
            for (const pk of patKeys) {
                const list = cxByKey.get(pk);
                if (!list) continue;
                for (const cx of list) {
                    const dm = diffMinutes(t0, cx.dtInicio);
                    if (dm !== null && dm >= 0 && dm <= 2880) {
                        if (!cxMatch || dm < diffMinutes(t0, cxMatch.dtInicio)) {
                            cxMatch = cx;
                        }
                    }
                }
            }

            const visitObj = {
                idVisita: Number(v.idVisita),
                periodo,
                fechaGgo,
                nhc: v.NHC ? String(v.NHC).trim() : null,
                dni: v.DNI ? String(v.DNI).trim() : null,
                patKey: kNhc || kDni || `V_${v.idVisita}`,
                paciente: (v.Paciente || 'SIN NOMBRE').trim(),
                obraSocial: (v.Cliente || 'PARTICULAR').trim(),
                rama,
                prioridad,
                tipoVisita: (v.TipoVisita || '').trim(),
                medico: (v.Medico || 'SIN MÉDICO').trim(),
                franja: getFranjaArg(t0),
                diaSemana: getDiaSemanaArg(t0),
                t0,
                t2,
                t3,
                validEspera,
                validAtencion,
                validPerm,
                ecoMatch,
                admMatch,
                cxMatch,
                esReconsulta72h: false,
            };

            parsedVisits.push(visitObj);
            if (!visitsByPatient.has(visitObj.patKey)) visitsByPatient.set(visitObj.patKey, []);
            visitsByPatient.get(visitObj.patKey).push(visitObj);
        }

        // Detectar reconsultas <= 72h (entre 2h y 72h después de una consulta previa de la misma paciente)
        for (const list of visitsByPatient.values()) {
            if (list.length < 2) continue;
            list.sort((a, b) => a.t0.getTime() - b.t0.getTime());
            for (let i = 1; i < list.length; i++) {
                const diffH = (list[i].t0.getTime() - list[i - 1].t0.getTime()) / 3600000;
                if (diffH >= 2 && diffH <= 72) {
                    list[i].esReconsulta72h = true;
                }
            }
        }

        // 6. Construir registros de gob_ggo_quirofano_tiempos (4 tramos cuello de botella) + agregados mensuales + franjas
        const qxNominalRows = [];
        const byPeriodo = new Map();
        const byFranja = new Map();

        const getPeriodoBucket = (per) => {
            if (!byPeriodo.has(per)) {
                const [yy, mm] = per.split('-').map(Number);
                byPeriodo.set(per, {
                    periodo: per,
                    anio: yy,
                    mes: mm,
                    total: 0, gine: 0, obst: 0,
                    n1: 0, n2: 0, n3: 0,
                    esperas: [], atenciones: [], perms: [],
                    ecoCount: 0, intCount: 0,
                    qxTotal: 0, qxUrg: 0, qxProgExcl: 0,
                    qxT1: [], qxT2: [], qxT3: [], qxT4: [], qxTot: [],
                    reconsultas: 0,
                    medicos: new Map(),
                    obras: new Map(),
                });
            }
            return byPeriodo.get(per);
        };

        const addFranjaMetric = (per, franja, dia, v, qxTotalMin) => {
            const key = `${per}|${franja}|${dia}`;
            if (!byFranja.has(key)) {
                byFranja.set(key, {
                    periodo: per, franja_horaria: franja, dia_semana: dia,
                    total: 0, obst: 0, gine: 0, esperas: [], perms: [], eco: 0, qx: 0, qxMins: [],
                });
            }
            const f = byFranja.get(key);
            f.total++;
            if (v.rama === 'OBSTETRICIA') f.obst++; else f.gine++;
            if (v.validEspera !== null) f.esperas.push(v.validEspera);
            if (v.validPerm !== null) f.perms.push(v.validPerm);
            if (v.ecoMatch) f.eco++;
            if (qxTotalMin !== null) {
                f.qx++;
                f.qxMins.push(qxTotalMin);
            }
        };

        for (const v of parsedVisits) {
            const b = getPeriodoBucket(v.periodo);
            b.total++;
            if (v.rama === 'OBSTETRICIA') b.obst++; else b.gine++;
            if (v.prioridad === 'N1') b.n1++;
            else if (v.prioridad === 'N2') b.n2++;
            else b.n3++;

            if (v.validEspera !== null) b.esperas.push(v.validEspera);
            if (v.validAtencion !== null) b.atenciones.push(v.validAtencion);
            if (v.validPerm !== null) b.perms.push(v.validPerm);
            if (v.ecoMatch) b.ecoCount++;
            if (v.admMatch) b.intCount++;
            if (v.esReconsulta72h) b.reconsultas++;

            b.medicos.set(v.medico, (b.medicos.get(v.medico) || 0) + 1);
            b.obras.set(v.obraSocial, (b.obras.get(v.obraSocial) || 0) + 1);

            let qxTotalMinForFranja = null;

            if (v.cxMatch) {
                b.qxTotal++;
                const cx = v.cxMatch;
                const t5 = cx.dtInicio;
                const totalPuertaQx = Math.max(0, diffMinutes(v.t0, t5) || 0);

                // Determinar los 4 tramos de cuello de botella sin solapar ni generar negativos
                const t1 = v.validEspera !== null ? Math.min(v.validEspera, totalPuertaQx) : 0;

                let t2 = 0;
                if (v.t2 && v.t3 && v.t3 <= t5) {
                    t2 = Math.max(0, Math.min(diffMinutes(v.t2, v.t3) || 0, totalPuertaQx - t1));
                } else if (v.validAtencion !== null) {
                    t2 = Math.min(v.validAtencion, Math.max(0, totalPuertaQx - t1));
                }

                const finGgoMs = v.t0.getTime() + (t1 + t2) * 60000;
                let t4 = v.admMatch?.dtIng || null;
                if (t4 && (t4.getTime() < finGgoMs || t4.getTime() > t5.getTime())) {
                    t4 = null;
                }

                const t3 = t4 ? Math.max(0, Math.round(((t4.getTime() - finGgoMs) / 60000) * 10) / 10) : 0;
                const refPreQxMs = t4 ? t4.getTime() : finGgoMs;
                const t4Min = Math.max(0, Math.round(((t5.getTime() - refPreQxMs) / 60000) * 10) / 10);

                const totalGgo = Math.round((t1 + t2) * 10) / 10;
                const totalPostGgo = Math.round((t3 + t4Min) * 10) / 10;

                // Tramo dominante (cuello de botella)
                const tramos = [
                    { k: 'ESPERA_MEDICO_GGO', v: t1 },
                    { k: 'ATENCION_GGO', v: t2 },
                    { k: 'ADMISION_PRE_QX', v: t3 },
                    { k: 'ESPERA_QUIROFANO', v: t4Min },
                ].sort((a, z) => z.v - a.v);
                const cuello = tramos[0].k;

                const metaMin = v.prioridad === 'N1' ? 60 : v.prioridad === 'N2' ? 180 : 360;
                const cumpleMeta = totalPuertaQx <= metaMin;

                if (cx.esUrgencia) {
                    b.qxUrg++;
                    b.qxT1.push(t1);
                    b.qxT2.push(t2);
                    b.qxT3.push(t3);
                    b.qxT4.push(t4Min);
                    b.qxTot.push(totalPuertaQx);
                    qxTotalMinForFranja = totalPuertaQx;
                } else {
                    b.qxProgExcl++;
                }

                qxNominalRows.push({
                    id_visita_ggo: v.idVisita,
                    periodo: v.periodo,
                    fecha_ggo: v.fechaGgo,
                    nhc: v.nhc,
                    dni: v.dni,
                    paciente: v.paciente,
                    obra_social: v.obraSocial,
                    rama: v.rama,
                    prioridad: v.prioridad,
                    tipo_visita_ggo: v.tipoVisita,
                    medico_ggo: v.medico,
                    franja_horaria: v.franja,
                    dia_semana: v.diaSemana,
                    t0_entrada_ggo: v.t0.toISOString(),
                    t2_inicio_medico_ggo: v.t2 ? v.t2.toISOString() : null,
                    t3_salida_ggo: v.t3 ? v.t3.toISOString() : null,
                    t4_admision_hosp: t4 ? t4.toISOString() : (v.admMatch?.dtIng ? v.admMatch.dtIng.toISOString() : null),
                    t5_inicio_quirofano: t5.toISOString(),
                    t6_fin_quirofano: cx.dtFin ? cx.dtFin.toISOString() : null,
                    min_tramo1_puerta_medico: t1,
                    min_tramo2_atencion_ggo: t2,
                    min_tramo3_post_ggo_adm: t3,
                    min_tramo4_adm_quirofano: t4Min,
                    min_total_ggo: totalGgo,
                    min_total_post_ggo: totalPostGgo,
                    min_total_puerta_qx: totalPuertaQx,
                    cuello_botella_dominante: cuello,
                    cumple_meta: cumpleMeta,
                    numero_admision: v.admMatch?.numero_admision || null,
                    nombre_cirugia: cx.nombreCirugia,
                    especialidad_cx: cx.especialidad,
                    cirujano: cx.cirujano,
                    estado_cx: cx.estado,
                    es_urgencia_real: cx.esUrgencia,
                    tuvo_eco_guardia: Boolean(v.ecoMatch),
                    eco_guardia_tipo: v.ecoMatch?.tipo || null,
                    eco_guardia_fecha: v.ecoMatch?.dt ? v.ecoMatch.dt.toISOString() : null,
                    min_ggo_a_eco: v.ecoMatch ? v.ecoMatch.dm : null,
                    updated_at: now.toISOString(),
                });
            }

            addFranjaMetric(v.periodo, v.franja, v.diaSemana, v, qxTotalMinForFranja);
            addFranjaMetric(v.periodo, v.franja, 'TODOS', v, qxTotalMinForFranja);
        }

        const resumenRows = Array.from(byPeriodo.values()).map(b => {
            const topMedicos = Array.from(b.medicos.entries())
                .map(([nombre, count]) => ({ nombre, count }))
                .sort((a, z) => z.count - a.count)
                .slice(0, 15);
            const topObras = Array.from(b.obras.entries())
                .map(([nombre, count]) => ({ nombre, count }))
                .sort((a, z) => z.count - a.count)
                .slice(0, 15);
            return {
                periodo: b.periodo,
                anio: b.anio,
                mes: b.mes,
                total_consultas: b.total,
                consultas_ginecologia: b.gine,
                consultas_obstetricia: b.obst,
                consultas_n1: b.n1,
                consultas_n2: b.n2,
                consultas_n3: b.n3,
                mediana_puerta_medico_min: calcPercentile(b.esperas, 50),
                promedio_puerta_medico_min: calcAvg(b.esperas),
                p90_puerta_medico_min: calcPercentile(b.esperas, 90),
                mediana_atencion_ggo_min: calcPercentile(b.atenciones, 50),
                mediana_permanencia_ggo_min: calcPercentile(b.perms, 50),
                derivaciones_eco_guardia: b.ecoCount,
                pct_eco_guardia: b.total > 0 ? Math.round((b.ecoCount / b.total) * 10000) / 100 : 0,
                pases_internacion: b.intCount,
                pct_internacion: b.total > 0 ? Math.round((b.intCount / b.total) * 10000) / 100 : 0,
                derivaciones_quirofano_total: b.qxTotal,
                derivaciones_quirofano_urgencia: b.qxUrg,
                derivaciones_quirofano_programadas_excluidas: b.qxProgExcl,
                pct_conversion_quirofano: b.total > 0 ? Math.round((b.qxUrg / b.total) * 10000) / 100 : 0,
                mediana_qx_tramo1_espera_ggo_min: calcPercentile(b.qxT1, 50),
                mediana_qx_tramo2_atencion_ggo_min: calcPercentile(b.qxT2, 50),
                mediana_qx_tramo3_post_ggo_adm_min: calcPercentile(b.qxT3, 50),
                mediana_qx_tramo4_adm_qx_min: calcPercentile(b.qxT4, 50),
                mediana_qx_total_puerta_qx_min: calcPercentile(b.qxTot, 50),
                p90_qx_total_puerta_qx_min: calcPercentile(b.qxTot, 90),
                reconsultas_72h: b.reconsultas,
                pct_reconsultas_72h: b.total > 0 ? Math.round((b.reconsultas / b.total) * 10000) / 100 : 0,
                top_medicos_json: topMedicos,
                top_obras_sociales_json: topObras,
                updated_at: now.toISOString(),
            };
        });

        const franjasRows = Array.from(byFranja.values()).map(f => ({
            periodo: f.periodo,
            franja_horaria: f.franja_horaria,
            dia_semana: f.dia_semana,
            total_consultas: f.total,
            consultas_obstetricia: f.obst,
            consultas_ginecologia: f.gine,
            mediana_puerta_medico_min: calcPercentile(f.esperas, 50),
            promedio_puerta_medico_min: calcAvg(f.esperas),
            mediana_permanencia_min: calcPercentile(f.perms, 50),
            derivaciones_eco: f.eco,
            derivaciones_qx: f.qx,
            mediana_puerta_qx_min: calcPercentile(f.qxMins, 50),
            updated_at: now.toISOString(),
        }));

        // 7. Subir a Supabase
        const periodosTouched = Array.from(byPeriodo.keys());
        console.log(`☁️ Subiendo a Supabase (${resumenRows.length} meses, ${qxNominalRows.length} casos GGO→Qx, ${franjasRows.length} franjas)...`);

        if (resumenRows.length > 0) {
            const { error: errR } = await supabase
                .from('gob_ggo_resumen_mensual')
                .upsert(resumenRows, { onConflict: 'periodo' });
            if (errR) throw new Error(`Error resumen GGO: ${errR.message}`);
        }

        if (periodosTouched.length > 0) {
            await supabase.from('gob_ggo_quirofano_tiempos').delete().in('periodo', periodosTouched);
            const BATCH = 300;
            // Deduplicar por unique key (id_visita_ggo, nombre_cirugia, t5_inicio_quirofano)
            const qxDedup = new Map();
            for (const r of qxNominalRows) {
                qxDedup.set(`${r.id_visita_ggo}|${r.nombre_cirugia}|${r.t5_inicio_quirofano}`, r);
            }
            const qxFinal = Array.from(qxDedup.values());
            for (let i = 0; i < qxFinal.length; i += BATCH) {
                const chunk = qxFinal.slice(i, i + BATCH);
                const { error } = await supabase.from('gob_ggo_quirofano_tiempos').insert(chunk);
                if (error) console.error(`❌ Error batch qx ${i}:`, error.message);
            }

            await supabase.from('gob_ggo_franjas_tiempos').delete().in('periodo', periodosTouched);
            for (let i = 0; i < franjasRows.length; i += BATCH) {
                const chunk = franjasRows.slice(i, i + BATCH);
                const { error } = await supabase.from('gob_ggo_franjas_tiempos').insert(chunk);
                if (error) console.error(`❌ Error batch franjas ${i}:`, error.message);
            }
        }

        // Auditoría rápida últimos 3 meses
        console.log('\n📈 Auditoría rápida GGO (últimos 3 meses):');
        resumenRows
            .sort((a, b) => b.periodo.localeCompare(a.periodo))
            .slice(0, 3)
            .forEach(r => {
                console.log(
                    `   • ${r.periodo}: ${r.total_consultas} cons (Obst ${r.consultas_obstetricia} / Gine ${r.consultas_ginecologia}) | ` +
                    `Eco Guardia: ${r.derivaciones_eco_guardia} (${r.pct_eco_guardia}%) | ` +
                    `Qx Urg: ${r.derivaciones_quirofano_urgencia} | ` +
                    `Mediana Puerta→Qx: ${r.mediana_qx_total_puerta_qx_min} min (GGO: ${r.mediana_qx_tramo1_espera_ggo_min}+${r.mediana_qx_tramo2_atencion_ggo_min}m | Post-GGO: ${r.mediana_qx_tramo3_post_ggo_adm_min}+${r.mediana_qx_tramo4_adm_qx_min}m)`
                );
            });

        return { meses: resumenRows.length, casosQx: qxNominalRows.length, franjas: franjasRows.length };
    } finally {
        await pool.close();
    }
}

if (process.argv[1] && process.argv[1].endsWith('sync_guardia_ggo.mjs')) {
    const fastSync = process.argv.includes('--recent');
    syncGuardiaGGO({ startYear: 2025, fastSync })
        .then(() => {
            console.log('🏁 Sincronización de Guardia GGO finalizada.');
            process.exit(0);
        })
        .catch(err => {
            console.error('❌ Error fatal GGO:', err);
            process.exit(1);
        });
}
