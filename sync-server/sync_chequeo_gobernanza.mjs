/**
 * sync_chequeo_gobernanza.mjs
 * Pre-agrega todos los "Mayores" de Chequeo Preventivo en Supabase:
 *  - gob_chequeo_mensual (por periodo YYYY-MM y sede TODAS / SANTA FE / SAN LUIS)
 *  - gob_chequeo_resumen ('renovacion_anual', 'encuestas_calidad', 'conversion_wa_30d', 'meta')
 * Así el tablero de Gobernanza carga en < 150ms sin paginar 31k+ filas en el navegador.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envLocal = resolve(__dirname, '.env');
const envParent = resolve(__dirname, '..', '.env');
dotenv.config({ path: fs.existsSync(envLocal) ? envLocal : envParent });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://hakysnqiryimxbwdslwe.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const PAGE_SIZE = 1000;
const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const AGE_BINS = [
    { key: '<18', label: '< 18', min: 0, max: 17 },
    { key: '18-29', label: '18–29', min: 18, max: 29 },
    { key: '30-39', label: '30–39', min: 30, max: 39 },
    { key: '40-49', label: '40–49', min: 40, max: 49 },
    { key: '50-59', label: '50–59', min: 50, max: 59 },
    { key: '60-69', label: '60–69', min: 60, max: 69 },
    { key: '70+', label: '70+', min: 70, max: 150 },
];

async function paginate(buildQuery, maxPages = 120) {
    let all = [];
    let from = 0;
    for (let p = 0; p < maxPages; p++) {
        const { data, error } = await buildQuery(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        const rows = data || [];
        all = all.concat(rows);
        if (rows.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
    }
    return all;
}

function isInformeVisit(v) {
    const tv = String(v?.tipo_visita || '').toUpperCase();
    return tv.includes('INFORME') || tv.includes('CHQ INF');
}

function normalizeSede(centro) {
    const c = String(centro || '').toUpperCase();
    if (c.includes('SAN LUIS')) return 'SAN LUIS';
    if (c.includes('SANTA FE')) return 'SANTA FE';
    return 'OTRA';
}

function computeMensualBuckets(rows, sedeTarget) {
    const hoy = new Date().toISOString().split('T')[0];
    const byMonth = {};
    const firstChqByDni = {};
    const firstInfByDni = {};

    for (const v of rows) {
        if (!v.fecha) continue;
        const dni = String(v.dni || v.paciente || '').trim();
        if (!dni) continue;
        const sedeRow = normalizeSede(v.centro);
        if (sedeTarget !== 'TODAS' && sedeRow !== sedeTarget) continue;

        const isInf = isInformeVisit(v);
        const asis = v.asistencia || (v.fecha < hoy ? 'Ausente' : 'Pendiente');
        const isPres = String(asis).toLowerCase() === 'presente';
        const isAus = String(asis).toLowerCase().includes('ausen');
        const isPend = !isPres && !isAus && v.fecha >= hoy;

        const mes = v.fecha.substring(0, 7);
        if (!byMonth[mes]) {
            byMonth[mes] = {
                chqAll: new Set(), chqPres: new Set(), chqAus: new Set(), chqPend: new Set(),
                infAll: new Set(), infPres: new Set(), infAus: new Set(), infPend: new Set(),
                osCounts: {}, osSeen: new Set(),
                medCounts: {},
                ageBins: AGE_BINS.map(b => ({ key: b.key, label: b.label, count: 0 })),
                ageSeen: new Set(), edadSum: 0, edadCnt: 0,
            };
        }
        const m = byMonth[mes];

        if (isInf) {
            m.infAll.add(dni);
            if (isPres) {
                m.infPres.add(dni);
                if (!firstInfByDni[dni] || v.fecha > firstInfByDni[dni]) firstInfByDni[dni] = v.fecha;
                if (v.medico) m.medCounts[v.medico] = (m.medCounts[v.medico] || 0) + 1;
            } else if (isAus) m.infAus.add(dni);
            else if (isPend) m.infPend.add(dni);
        } else {
            m.chqAll.add(dni);
            if (isPres) {
                m.chqPres.add(dni);
                if (!firstChqByDni[dni] || v.fecha < firstChqByDni[dni]) firstChqByDni[dni] = { fecha: v.fecha, mes };
                if (!m.osSeen.has(dni)) {
                    m.osSeen.add(dni);
                    const os = (v.obra_social || 'Particular / Sin OS').replace(/^\d+\s*-\s*/, '').trim();
                    m.osCounts[os] = (m.osCounts[os] || 0) + 1;
                }
                const ed = Number(v.edad);
                if (!m.ageSeen.has(dni) && Number.isFinite(ed) && ed > 0 && ed <= 115) {
                    m.ageSeen.add(dni);
                    m.edadSum += ed;
                    m.edadCnt++;
                    const bin = AGE_BINS.find(b => ed >= b.min && ed <= b.max);
                    if (bin) {
                        const target = m.ageBins.find(x => x.key === bin.key);
                        if (target) target.count++;
                    }
                }
            } else if (isAus) m.chqAus.add(dni);
            else if (isPend) m.chqPend.add(dni);
        }
    }

    // Asignar demora al informe en el mes del chequeo
    const demoraByMonth = {};
    for (const [dni, chqInfo] of Object.entries(firstChqByDni)) {
        const fInf = firstInfByDni[dni];
        if (fInf && fInf >= chqInfo.fecha) {
            const diff = Math.round((new Date(`${fInf}T12:00:00`) - new Date(`${chqInfo.fecha}T12:00:00`)) / 86400000);
            if (diff >= 0 && diff <= 120) {
                if (!demoraByMonth[chqInfo.mes]) demoraByMonth[chqInfo.mes] = { sum: 0, cnt: 0 };
                demoraByMonth[chqInfo.mes].sum += diff;
                demoraByMonth[chqInfo.mes].cnt++;
            }
        }
    }

    const nowIso = new Date().toISOString();
    return Object.entries(byMonth).sort((a, b) => a[0].localeCompare(b[0])).map(([periodo, m]) => {
        const resolved = m.chqPres.size + m.chqAus.size;
        const tasaAsis = resolved > 0 ? Math.round((m.chqPres.size / resolved) * 1000) / 10 : 0;
        const tasaRet = m.chqPres.size > 0 ? Math.round((m.infPres.size / m.chqPres.size) * 1000) / 10 : 0;
        const topOs = Object.entries(m.osCounts).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([name, value]) => ({ name, value }));
        const topMed = Object.entries(m.medCounts).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([name, value]) => ({ name, value }));
        const dem = demoraByMonth[periodo] || { sum: 0, cnt: 0 };

        return {
            periodo,
            sede: sedeTarget,
            chq_agendados: m.chqAll.size,
            chq_presentes: m.chqPres.size,
            chq_ausentes: m.chqAus.size,
            chq_pendientes: m.chqPend.size,
            inf_agendados: m.infAll.size,
            inf_presentes: m.infPres.size,
            inf_ausentes: m.infAus.size,
            inf_pendientes: m.infPend.size,
            tasa_asistencia_pct: tasaAsis,
            tasa_retorno_pct: tasaRet,
            demora_dias_sum: dem.sum,
            demora_dias_cnt: dem.cnt,
            edad_sum: Math.round(m.edadSum * 10) / 10,
            edad_cnt: m.edadCnt,
            age_bins: m.ageBins,
            top_os: topOs,
            top_medicos: topMed,
            synced_at: nowIso,
        };
    });
}

function buildRenovacionSnapshot(rows) {
    const bySede = {};
    for (const sedeTarget of ['TODAS', 'SANTA FE', 'SAN LUIS']) {
        const byDni = {};
        for (const v of rows) {
            if (!v.dni || !v.fecha) continue;
            if (sedeTarget !== 'TODAS' && normalizeSede(v.centro) !== sedeTarget) continue;
            const tel1 = v.telefono1 || '';
            if (!byDni[v.dni]) {
                byDni[v.dni] = { ultima_chq: v.fecha, hasPhone: Boolean(tel1) };
            } else {
                if (!byDni[v.dni].hasPhone && tel1) byDni[v.dni].hasPhone = true;
                if (v.fecha > byDni[v.dni].ultima_chq) byDni[v.dni].ultima_chq = v.fecha;
            }
        }
        const now = new Date();
        const patients = Object.values(byDni).map(p => {
            const d = new Date(`${p.ultima_chq}T12:00:00`);
            const meses = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
            return { meses, hasPhone: p.hasPhone };
        });

        const vencidosTotal = patients.filter(p => p.meses >= 12).length;
        const vencidosContactables = patients.filter(p => p.meses >= 12 && p.hasPhone).length;
        const bars = [{ name: 'Ya Vencidos (≥12m)', total: vencidosTotal, contactables: vencidosContactables }];
        let prox6Total = 0, prox6Contactables = 0;

        for (let i = 1; i <= 6; i++) {
            const targetMeses = 12 - i;
            const dt = new Date(now.getFullYear(), now.getMonth() + i, 1);
            const label = `${MONTH_NAMES[dt.getMonth()]} ${String(dt.getFullYear()).slice(2)}`;
            const tot = patients.filter(p => p.meses === targetMeses).length;
            const cont = patients.filter(p => p.meses === targetMeses && p.hasPhone).length;
            prox6Total += tot;
            prox6Contactables += cont;
            bars.push({ name: label, total: tot, contactables: cont });
        }
        const totalUniverso = vencidosTotal + prox6Total;
        const totalContactables = vencidosContactables + prox6Contactables;
        bySede[sedeTarget] = {
            bars,
            vencidosTotal,
            vencidosContactables,
            prox6Total,
            totalUniverso,
            totalContactables,
            sinTelefono: Math.max(0, totalUniverso - totalContactables),
            pctContactable: totalUniverso > 0 ? Math.round((totalContactables / totalUniverso) * 100) : 0,
        };
    }
    return bySede;
}

function getLast7(phone) {
    const d = String(phone || '').replace(/\D/g, '');
    return d.length >= 7 ? d.slice(-7) : '';
}

function buildConversionWaMayores(messages, turnos) {
    const byPhone = new Map();
    for (const m of messages) {
        if (!m.phone || !m.created_at) continue;
        const ts = new Date(m.created_at).getTime();
        if (!Number.isFinite(ts)) continue;
        const dayKey = new Date(ts).toLocaleDateString('en-CA', { timeZone: 'America/Argentina/San_Juan' });

        if (!byPhone.has(m.phone)) {
            byPhone.set(m.phone, {
                p: m.phone,
                l7: getLast7(m.phone),
                n: '',
                incByDay: new Map(),
                outByDay: new Map(),
            });
        }
        const e = byPhone.get(m.phone);
        if (m.direction === 'incoming') {
            if (m.sender_name && !e.n) e.n = String(m.sender_name).slice(0, 60);
            if (!e.incByDay.has(dayKey) || ts < e.incByDay.get(dayKey)) {
                e.incByDay.set(dayKey, ts);
            }
        } else {
            const isBot = (m.sender_name || '').includes('Dora') || (m.content || '').includes('Encuesta de Satisfacción');
            if (!isBot) {
                if (!e.outByDay.has(dayKey) || ts < e.outByDay.get(dayKey)) {
                    e.outByDay.set(dayKey, ts);
                }
            }
        }
    }

    const turnosByLast7 = new Map();
    for (const t of turnos) {
        const compact = {
            id: t.id_visita,
            pa: t.paciente || '',
            dn: t.dni || '',
            sx: t.sexo || '',
            os: t.obra_social || '',
            ce: t.centro || '',
            ca: t.categoria_turno || 'Otros Ambulatorios',
            fv: t.fecha_visita || '',
            fc: t.fecha_creacion || '',
            as: t.asistencia || '',
        };
        if (t.tel1_last7) {
            if (!turnosByLast7.has(t.tel1_last7)) turnosByLast7.set(t.tel1_last7, []);
            turnosByLast7.get(t.tel1_last7).push(compact);
        }
        if (t.tel2_last7 && t.tel2_last7 !== t.tel1_last7) {
            if (!turnosByLast7.has(t.tel2_last7)) turnosByLast7.set(t.tel2_last7, []);
            turnosByLast7.get(t.tel2_last7).push(compact);
        }
    }

    const phones = [];
    for (const e of byPhone.values()) {
        if (!e.incByDay.size) continue;
        const inc = [...e.incByDay.values()].sort((a, b) => a - b);
        const out = [...e.outByDay.values()].sort((a, b) => a - b);
        const cands = e.l7 ? (turnosByLast7.get(e.l7) || []) : [];
        // Deduplicar turnos por id_visita
        const tUnique = cands.length > 0
            ? [...new Map(cands.map(t => [t.id, t])).values()]
            : [];
        phones.push({
            p: e.p,
            n: e.n,
            i: inc,
            o: out,
            t: tUnique,
        });
    }

    return {
        version: 1,
        total_phones: phones.length,
        total_messages: messages.length,
        total_turnos: turnos.length,
        phones,
    };
}

export async function syncChequeoGobernanza() {
    const t0 = Date.now();
    console.log('🩺 [sync_chequeo_gobernanza] Iniciando pre-agregación de mayores de Chequeo Preventivo...');

    // 1. Leer recepciones_visitas CHQ (incluye telefono1 para renovación anual sin re-escanear visitas_chequeo)
    const chqRows = await paginate((from, to) =>
        supabase
            .from('recepciones_visitas')
            .select('fecha, dni, paciente, edad, obra_social, centro, asistencia, tipo_visita, tipo_agenda, medico, telefono1')
            .or('tipo_visita.ilike.%CHQ%,tipo_agenda.ilike.%CHQ%')
            .not('fecha', 'is', null)
            .range(from, to)
    );
    console.log(`   → Leídos ${chqRows.length.toLocaleString('es-AR')} registros CHQ de recepciones_visitas.`);

    // 2. Generar filas de mayores mensuales para TODAS, SANTA FE y SAN LUIS
    const mensualRows = [
        ...computeMensualBuckets(chqRows, 'TODAS'),
        ...computeMensualBuckets(chqRows, 'SANTA FE'),
        ...computeMensualBuckets(chqRows, 'SAN LUIS'),
    ];

    if (mensualRows.length > 0) {
        const { error: errUp } = await supabase
            .from('gob_chequeo_mensual')
            .upsert(mensualRows, { onConflict: 'periodo,sede' });
        if (errUp) throw errUp;
    }
    console.log(`   → Upsert de ${mensualRows.length} filas de mayores en gob_chequeo_mensual.`);

    // 3. Proyección de renovación anual sobre pacientes Presentes CHQ (en memoria, 0 queries extra)
    const renovRows = chqRows.filter(v => String(v.asistencia || '').toLowerCase() === 'presente' && v.dni);
    const renovacionPayload = buildRenovacionSnapshot(renovRows);

    // 4. Encuestas de calidad (Edge Function + fallback tabla)
    let encuestasList = [];
    try {
        const { data: fnData, error: fnErr } = await supabase.functions.invoke('get-encuestas-metrics', { method: 'POST' });
        if (!fnErr && Array.isArray(fnData?.data)) encuestasList = fnData.data;
    } catch (_) { }
    if (!encuestasList.length) {
        const { data: tbData } = await supabase
            .from('encuestas_preventivos')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(1000);
        encuestasList = tbData || [];
    }

    // 5. Conversión WhatsApp (line_recepciones) → SALUS (salus_turnos_conversion) pre-cruzada por teléfono
    console.log('   → Pre-cruzando WhatsApp (line_recepciones) con salus_turnos_conversion...');
    const [waMessages, salusTurnos] = await Promise.all([
        paginate((from, to) =>
            supabase
                .from('whatsapp_messages')
                .select('phone, direction, created_at, sender_name, content')
                .eq('line_id', 'line_recepciones')
                .order('created_at', { ascending: true })
                .range(from, to),
            120
        ),
        paginate((from, to) =>
            supabase
                .from('salus_turnos_conversion')
                .select('id_visita, paciente, dni, sexo, obra_social, centro, categoria_turno, fecha_visita, fecha_creacion, asistencia, tel1_last7, tel2_last7')
                .order('fecha_visita', { ascending: true })
                .range(from, to),
            120
        ),
    ]);
    const conversionPayload = buildConversionWaMayores(waMessages, salusTurnos);
    console.log(`   → Conversión WA pre-cruzada: ${conversionPayload.total_phones.toLocaleString('es-AR')} teléfonos únicos (${waMessages.length.toLocaleString('es-AR')} msgs × ${salusTurnos.length.toLocaleString('es-AR')} turnos).`);

    const nowIso = new Date().toISOString();
    const resumenRows = [
        { clave: 'renovacion_anual', payload: renovacionPayload, synced_at: nowIso },
        { clave: 'encuestas_calidad', payload: { items: encuestasList }, synced_at: nowIso },
        { clave: 'conversion_wa_mayores', payload: conversionPayload, synced_at: nowIso },
        { clave: 'meta', payload: { total_chq_rows: chqRows.length, total_renov_rows: renovRows.length, total_encuestas: encuestasList.length, total_wa_phones: conversionPayload.total_phones, synced_at: nowIso }, synced_at: nowIso },
    ];
    const { error: errRes } = await supabase
        .from('gob_chequeo_resumen')
        .upsert(resumenRows, { onConflict: 'clave' });
    if (errRes) throw errRes;

    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`✅ [sync_chequeo_gobernanza] Completado en ${secs}s (${mensualRows.length} mayores mensuales + 4 snapshots).`);
    return { mensualCount: mensualRows.length, totalChqRows: chqRows.length, totalEncuestas: encuestasList.length, totalWaPhones: conversionPayload.total_phones };
}

const isMain = process.argv[1] && process.argv[1].includes('sync_chequeo_gobernanza');
if (isMain) {
    syncChequeoGobernanza().then(() => process.exit(0)).catch(err => {
        console.error('❌ Error en sync_chequeo_gobernanza:', err);
        process.exit(1);
    });
}
