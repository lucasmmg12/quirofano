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
        connectionTimeout: 20000,
        tdsVersion: '7_4',
    },
    pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
};

const EXCLUDED_SERVICES = new Set([
    'CHEQUEO',
    'CONSULTORIOS - C.EXTERNOS',
    'CONSULTORIOS - INTERNADO',
    'URGENCIAS',
    'SHOCK ROOM',
    'ECOGRAFIAS - INTERNADO',
    'DERMATOLOGIA',
]);

function normalizeText(val) {
    if (!val) return '';
    return String(val)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .trim();
}

export function mapSectorYSubsector(rawServicio, rawHabitacion = '', rawNumAdm = '') {
    const s = normalizeText(rawServicio);
    const h = normalizeText(rawHabitacion);
    const n = normalizeText(rawNumAdm);

    if (!s && !h) return null;
    if (EXCLUDED_SERVICES.has(s)) return null;

    if (s.includes('NEONATOLOG') || h.includes('CUNA')) {
        return { sector: 'NEONATOLOGIA', subsector: '' };
    }
    if (s.includes('TERAPIA PEDIATRIC') || s.includes('UTIP') || h.includes('UTIP') || /^21[789]$|^22[01]$/.test(h)) {
        return { sector: 'PEDIATRIA', subsector: 'TERAPIA' };
    }
    if (s.includes('PEDIATR') || s.includes('INFANTIL')) {
        return { sector: 'PEDIATRIA', subsector: 'PISO' };
    }
    if (s === 'TERAPIA INTERMEDIA' || n.startsWith('TI')) {
        return { sector: 'TERAPIA INTERMEDIA', subsector: '' };
    }
    if (s === 'UCI' || n.startsWith('UCI')) {
        return { sector: 'UCI', subsector: '' };
    }
    if (
        s.includes('HOSPITAL DE DIA') ||
        s === 'HEMOTERAPIA' ||
        s === 'FERTILIDAD' ||
        h.includes('HDD') ||
        h.includes('HOSP DE DIA')
    ) {
        return { sector: 'HOSPITAL DE DIA', subsector: '' };
    }

    // Resto de servicios con internación de adultos (Internado, Internación Clínica, Qx Centrales, Gineco, Cirugía, etc.)
    return { sector: 'INTERNADO', subsector: '' };
}

export function detectarHierro(proceso, especialidad, servicio) {
    const p = normalizeText(proceso);
    const e = normalizeText(especialidad);
    const s = normalizeText(servicio);
    return (
        p.includes('COLOCACION DE MEDICACION') ||
        p.includes('HIERRO') ||
        p.includes('FERINJECT') ||
        p.includes('SACARATO') ||
        p.includes('VENOFER') ||
        e === 'HEMATOLOGIA' ||
        s === 'HEMOTERAPIA'
    );
}

/**
 * Parsea fecha de SALUS (puede venir como Date de mssql o string DD/MM/YYYY HH:mm:ss)
 */
function parseDate(val) {
    if (!val) return null;
    if (val instanceof Date) {
        return isNaN(val.getTime()) ? null : val;
    }
    const str = String(val).trim();
    if (!str) return null;
    const parts = str.split(' ');
    if (parts[0].includes('/')) {
        const [d, m, y] = parts[0].split('/').map(Number);
        const [hh = 0, mm = 0, ss = 0] = (parts[1] || '00:00:00').split(':').map(Number);
        if (!y || !m || !d) return null;
        return new Date(y, m - 1, d, hh, mm, ss);
    }
    const dt = new Date(str);
    return isNaN(dt.getTime()) ? null : dt;
}

/**
 * Convierte Date a día calendario entero (UTC-3 Argentina) usando YYYY-MM-DD local
 */
function toLocalYMD(dt) {
    return {
        y: dt.getFullYear(),
        m: dt.getMonth() + 1, // 1..12
        d: dt.getDate(),
    };
}

function dayNumber(y, m, d) {
    return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

/**
 * Calcula los Días Cama prorrateados por mes calendario usando la regla oficial de Sanatorio Argentino (Tableau):
 * - Día de ingreso = 0.5
 * - Cada día calendario intermedio completo = 1.0
 * - Día de egreso = 0.5
 * - Ingreso y egreso el mismo día = 0.5
 * Retorna Map<"YYYY-MM", number>
 */
export function prorratearDiasCamaPorMes(fechaInicio, fechaFin, nowDate = new Date()) {
    const result = new Map();
    if (!fechaInicio) return result;

    const isOpen = !fechaFin;
    let effectiveEnd = fechaFin || nowDate;
    if (effectiveEnd < fechaInicio) return result;
    // Protección contra admisiones administrativas viejas nunca cerradas en SALUS (> 120 días abiertas sin alta)
    if (isOpen && (effectiveEnd.getTime() - fechaInicio.getTime()) > 120 * 86400000) {
        effectiveEnd = fechaInicio;
    }

    const s = toLocalYMD(fechaInicio);
    const e = toLocalYMD(effectiveEnd);
    const sNum = dayNumber(s.y, s.m, s.d);
    const eNum = dayNumber(e.y, e.m, e.d);

    // Mismo día calendario
    if (sNum === eNum) {
        const key = `${s.y}-${String(s.m).padStart(2, '0')}`;
        result.set(key, 0.5);
        return result;
    }

    // Iterar mes a mes desde (s.y, s.m) hasta (e.y, e.m)
    let curY = s.y;
    let curM = s.m;
    let safety = 0;

    while ((curY < e.y || (curY === e.y && curM <= e.m)) && safety < 120) {
        safety++;
        const daysInMonth = new Date(curY, curM, 0).getDate();
        const mStartNum = dayNumber(curY, curM, 1);
        const mEndNum = dayNumber(curY, curM, daysInMonth);

        const cStart = Math.max(sNum, mStartNum);
        const cEnd = Math.min(eNum, mEndNum);

        if (cStart <= cEnd) {
            let days = (cEnd - cStart + 1);
            if (cStart === sNum) days -= 0.5;
            if (cEnd === eNum && !isOpen) days -= 0.5;
            if (days > 0) {
                const key = `${curY}-${String(curM).padStart(2, '0')}`;
                result.set(key, Math.round(days * 100) / 100);
            }
        }

        curM++;
        if (curM > 12) {
            curM = 1;
            curY++;
        }
    }

    return result;
}

function calcHorasHdD(fechaInicio, fechaFin) {
    if (!fechaInicio) return 0;
    if (!fechaFin) return 2.0; // estimación abierta
    const diffHours = (fechaFin.getTime() - fechaInicio.getTime()) / 3600000;
    if (diffHours < 0.25) return 1.0;
    if (diffHours > 16) return 12.0; // tope administrativo anti-outlier
    return Math.round(diffHours * 100) / 100;
}

export async function syncInternacionGobernanza({ startYear = 2021, nominalStartYear = 2022 } = {}) {
    console.log(`\n🏥 [SYNC INTERNACIÓN GOBERNANZA] Iniciando extracción desde SALUS (${startYear}–actualidad)...`);
    const pool = await sql.connect(SQL_CONFIG);
    const now = new Date();

    try {
        // 1. Extraer todas las admisiones desde startYear
        console.log(`📥 Consultando TABLEAU_Admisiones (>= ${startYear}-01-01)...`);
        const admQuery = `
            SELECT
                idAdmision,
                [Número admisión] AS numero_admision,
                Paciente,
                NHC,
                NIF,
                [Fecha ingreso] AS fecha_ingreso,
                [Fecha alta] AS fecha_alta,
                Servicio,
                [Habitación] AS habitacion,
                Cliente,
                Doctor,
                Especialidad,
                Proceso,
                [Motivo de alta] AS motivo_alta,
                Estado
            FROM [SALUS].[dbo].[TABLEAU_Admisiones] WITH (NOLOCK)
            WHERE [Fecha ingreso] >= '${startYear}-01-01'
              AND ISNULL(Estado, '') NOT IN ('ANULADA', 'CANCELADA')
        `;
        const admRes = await pool.request().query(admQuery);
        // Deduplicar por idAdmision (la vista TABLEAU_Admisiones puede repetir filas por joins internos)
        const admDedupMap = new Map();
        for (const r of admRes.recordset) {
            const id = Number(r.idAdmision);
            if (id && !admDedupMap.has(id)) admDedupMap.set(id, r);
        }
        const admRows = Array.from(admDedupMap.values());
        console.log(`   ✅ ${admRows.length} admisiones únicas extraídas de SALUS (de ${admRes.recordset.length} filas).`);

        // 2. Extraer historial de camas para desglosar traslados (Piso vs UTIP, UCI vs Intermedia)
        console.log(`📥 Consultando [TABLEAU_Admisiones con historial de camas2]...`);
        const histQuery = `
            SELECT
                h.idadmision,
                h.NombreHabitacion,
                h.fechaInicio,
                h.fechaFin,
                h.HOSP_Servicio
            FROM [SALUS].[dbo].[TABLEAU_Admisiones con historial de camas2] h WITH (NOLOCK)
            INNER JOIN [SALUS].[dbo].[TABLEAU_Admisiones] a WITH (NOLOCK) ON h.idadmision = a.idAdmision
            WHERE a.[Fecha ingreso] >= '${startYear}-01-01'
              AND ISNULL(a.Estado, '') NOT IN ('ANULADA', 'CANCELADA')
        `;
        const histRes = await pool.request().query(histQuery);
        const histByAdm = new Map();
        for (const h of histRes.recordset) {
            const id = Number(h.idadmision);
            if (!histByAdm.has(id)) histByAdm.set(id, []);
            histByAdm.get(id).push(h);
        }
        console.log(`   ✅ ${histRes.recordset.length} tramos de cama vinculados a ${histByAdm.size} admisiones.`);

        // 3. Procesar agregados mensuales y detalle nominal
        const aggMap = new Map(); // key -> { anio, mes, sector, subsector, cliente, especialidad, es_hierro, ingresos, egresos, dias_cama, horas_ocupacion }
        const nominalRows = [];

        const getAggBucket = (anio, mes, sector, subsector, cliente, especialidad, esHierro) => {
            if (anio < startYear || anio > now.getFullYear() + 1) return null;
            const key = `${anio}|${mes}|${sector}|${subsector}|${cliente}|${especialidad}|${esHierro ? 1 : 0}`;
            let b = aggMap.get(key);
            if (!b) {
                b = {
                    anio,
                    mes,
                    sector,
                    subsector,
                    cliente,
                    especialidad,
                    es_hierro: Boolean(esHierro),
                    ingresos: 0,
                    egresos: 0,
                    dias_cama: 0,
                    horas_ocupacion: 0,
                };
                aggMap.set(key, b);
            }
            return b;
        };

        for (const r of admRows) {
            const idAdm = Number(r.idAdmision);
            if (!idAdm) continue;

            const fIng = parseDate(r.fecha_ingreso);
            if (!fIng) continue;
            const fAlta = parseDate(r.fecha_alta);

            const mapped = mapSectorYSubsector(r.Servicio, r.habitacion, r.numero_admision);
            if (!mapped) continue;

            const cliente = (r.Cliente ? String(r.Cliente).trim() : 'PARTICULAR') || 'PARTICULAR';
            const doctor = (r.Doctor ? String(r.Doctor).trim() : 'SIN MÉDICO') || 'SIN MÉDICO';
            const especialidad = (r.Especialidad ? String(r.Especialidad).trim() : 'SIN ESPECIALIDAD') || 'SIN ESPECIALIDAD';
            const proceso = r.Proceso ? String(r.Proceso).trim() : null;
            const esHierro = detectarHierro(proceso, especialidad, r.Servicio);

            // Ingresos acreditados al mes de Fecha Ingreso
            const ingY = fIng.getFullYear();
            const ingM = fIng.getMonth() + 1;
            const bIng = getAggBucket(ingY, ingM, mapped.sector, mapped.subsector, cliente, especialidad, esHierro);
            if (bIng) bIng.ingresos += 1;

            // Egresos acreditados al mes de Fecha Alta
            if (fAlta) {
                const altY = fAlta.getFullYear();
                const altM = fAlta.getMonth() + 1;
                const bAlt = getAggBucket(altY, altM, mapped.sector, mapped.subsector, cliente, especialidad, esHierro);
                if (bAlt) bAlt.egresos += 1;
            }

            // Días Cama / Horas de Ocupación
            let diasCamaTotal = 0;
            let horasOcupTotal = 0;

            if (mapped.sector === 'HOSPITAL DE DIA') {
                horasOcupTotal = calcHorasHdD(fIng, fAlta);
                diasCamaTotal = Math.round((horasOcupTotal / 24) * 100) / 100;
                if (bIng) {
                    bIng.horas_ocupacion = Math.round((bIng.horas_ocupacion + horasOcupTotal) * 100) / 100;
                    bIng.dias_cama = Math.round((bIng.dias_cama + diasCamaTotal) * 100) / 100;
                }
            } else {
                const tramos = histByAdm.get(idAdm);
                // Usar tramos granulares si existen y pertenecen a sectores de internación (especialmente clave para Pediatría Piso/UTIP y UCI/Intermedia)
                const validTramos = (tramos || [])
                    .map(t => {
                        const tStart = parseDate(t.fechaInicio);
                        const tEnd = parseDate(t.fechaFin) || fAlta;
                        const tMap = mapSectorYSubsector(t.HOSP_Servicio || r.Servicio, t.NombreHabitacion, r.numero_admision);
                        return tStart && tMap && tMap.sector !== 'HOSPITAL DE DIA'
                            ? { tStart, tEnd, sector: tMap.sector, subsector: tMap.subsector }
                            : null;
                    })
                    .filter(Boolean);

                if (validTramos.length > 0 && (mapped.sector === 'PEDIATRIA' || mapped.sector === 'UCI' || mapped.sector === 'TERAPIA INTERMEDIA')) {
                    for (const t of validTramos) {
                        const porMes = prorratearDiasCamaPorMes(t.tStart, t.tEnd, now);
                        for (const [ym, dVal] of porMes.entries()) {
                            const [yy, mm] = ym.split('-').map(Number);
                            const b = getAggBucket(yy, mm, t.sector, t.subsector, cliente, especialidad, esHierro);
                            if (b) b.dias_cama = Math.round((b.dias_cama + dVal) * 100) / 100;
                            diasCamaTotal += dVal;
                        }
                    }
                } else {
                    const porMes = prorratearDiasCamaPorMes(fIng, fAlta, now);
                    for (const [ym, dVal] of porMes.entries()) {
                        const [yy, mm] = ym.split('-').map(Number);
                        const b = getAggBucket(yy, mm, mapped.sector, mapped.subsector, cliente, especialidad, esHierro);
                        if (b) b.dias_cama = Math.round((b.dias_cama + dVal) * 100) / 100;
                        diasCamaTotal += dVal;
                    }
                }
                diasCamaTotal = Math.round(diasCamaTotal * 100) / 100;
            }

            // Guardar detalle nominal para nominalStartYear+
            if (ingY >= nominalStartYear || (fAlta && fAlta.getFullYear() >= nominalStartYear) || !fAlta) {
                nominalRows.push({
                    id_admision: idAdm,
                    numero_admision: r.numero_admision ? String(r.numero_admision).trim() : null,
                    paciente: r.Paciente ? String(r.Paciente).trim() : 'SIN NOMBRE',
                    nhc: r.NHC ? String(r.NHC).trim() : null,
                    nif: r.NIF ? String(r.NIF).trim() : null,
                    fecha_ingreso: fIng.toISOString(),
                    fecha_alta: fAlta ? fAlta.toISOString() : null,
                    sector_arreglado: mapped.sector,
                    subsector: mapped.subsector,
                    servicio_salus: r.Servicio ? String(r.Servicio).trim() : null,
                    habitacion: r.habitacion ? String(r.habitacion).trim() : null,
                    cliente,
                    doctor,
                    especialidad,
                    proceso,
                    motivo_alta: r.motivo_alta ? String(r.motivo_alta).trim() : null,
                    es_hierro: esHierro,
                    dias_cama_total: diasCamaTotal,
                    horas_ocupacion: horasOcupTotal,
                    updated_at: now.toISOString(),
                });
            }
        }

        const aggList = Array.from(aggMap.values()).map(b => ({
            ...b,
            updated_at: now.toISOString(),
        }));

        console.log(`📊 Agregados mensuales calculados: ${aggList.length} filas.`);
        console.log(`📋 Registros nominales a sincronizar (${nominalStartYear}+): ${nominalRows.length} admisiones.`);

        // 4. Sincronizar gob_internacion_mensual_agg (reemplazo limpio por rango de años)
        console.log('☁️ Subiendo gob_internacion_mensual_agg a Supabase...');
        const { error: delErr } = await supabase
            .from('gob_internacion_mensual_agg')
            .delete()
            .gte('anio', startYear);
        if (delErr) throw new Error(`Error limpiando agg: ${delErr.message}`);

        const AGG_BATCH = 500;
        for (let i = 0; i < aggList.length; i += AGG_BATCH) {
            const chunk = aggList.slice(i, i + AGG_BATCH);
            const { error } = await supabase.from('gob_internacion_mensual_agg').insert(chunk);
            if (error) {
                console.error(`❌ Error batch agg ${i}:`, error.message);
            }
        }
        console.log(`   ✅ gob_internacion_mensual_agg actualizada (${aggList.length} filas).`);

        // 5. Upsert gob_internacion_admisiones en lotes de 500
        console.log('☁️ Subiendo gob_internacion_admisiones a Supabase...');
        const NOM_BATCH = 500;
        let nomOk = 0;
        for (let i = 0; i < nominalRows.length; i += NOM_BATCH) {
            const chunk = nominalRows.slice(i, i + NOM_BATCH);
            const { error } = await supabase
                .from('gob_internacion_admisiones')
                .upsert(chunk, { onConflict: 'id_admision' });
            if (error) {
                console.error(`❌ Error batch nominal ${i}:`, error.message);
            } else {
                nomOk += chunk.length;
            }
        }
        console.log(`   ✅ gob_internacion_admisiones actualizada (${nomOk}/${nominalRows.length} admisiones).`);

        // Resumen rápido de auditoría por sector (año 2026)
        const summary2026 = {};
        for (const b of aggList.filter(x => x.anio === 2026)) {
            const k = b.subsector ? `${b.sector} (${b.subsector})` : b.sector;
            if (!summary2026[k]) summary2026[k] = { ing: 0, egr: 0, dc: 0, hrs: 0 };
            summary2026[k].ing += b.ingresos;
            summary2026[k].egr += b.egresos;
            summary2026[k].dc += b.dias_cama;
            summary2026[k].hrs += b.horas_ocupacion;
        }
        console.log('\n📈 Auditoría rápida 2026:');
        Object.entries(summary2026).forEach(([k, v]) => {
            console.log(`   • ${k}: Ing=${v.ing} | Egr=${v.egr} | DíasCama=${v.dc.toFixed(1)} | HorasHdD=${v.hrs.toFixed(1)}`);
        });

        return { aggCount: aggList.length, nominalCount: nomOk };
    } finally {
        await pool.close();
    }
}

// Ejecución directa CLI
if (process.argv[1] && process.argv[1].endsWith('sync_internacion_gobernanza.mjs')) {
    const startYear = process.argv.includes('--recent') ? 2025 : 2021;
    const nominalStartYear = process.argv.includes('--recent') ? 2025 : 2022;
    syncInternacionGobernanza({ startYear, nominalStartYear })
        .then(() => {
            console.log('🏁 Sincronización de Internación Gobernanza finalizada.');
            process.exit(0);
        })
        .catch(err => {
            console.error('❌ Error fatal:', err);
            process.exit(1);
        });
}
