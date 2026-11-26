/**
 * chequeoGobernanzaService.js
 * Servicio unificado de analítica para el Tablero de Chequeo Preventivo en Gobernanza de Datos.
 * Lee directamente del ecosistema compartido en Supabase:
 *  - recepciones_visitas (31k+ registros CHQ 2024–2026+: Preventivo, Informe, Asistencia, Interanual, Edad)
 *  - visitas_chequeo (candidatos de renovación anual a 12 meses con teléfonos)
 *  - salus_turnos_conversion + whatsapp_messages (line_recepciones) → Embudo de Conversión WA → SALUS
 *  - get-encuestas-metrics / encuestas_preventivos → Calidad Post-Chequeo (NPS Q1, Claridad Q2, Agilidad Q3, Audios/Comentarios Q4)
 */

import { supabase } from '../lib/supabase';

const PAGE_SIZE = 1000;
export const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const AGE_BINS = [
    { key: '<18', label: '< 18', min: 0, max: 17 },
    { key: '18-29', label: '18–29', min: 18, max: 29 },
    { key: '30-39', label: '30–39', min: 30, max: 39 },
    { key: '40-49', label: '40–49', min: 40, max: 49 },
    { key: '50-59', label: '50–59', min: 50, max: 59 },
    { key: '60-69', label: '60–69', min: 60, max: 69 },
    { key: '70+', label: '70+', min: 70, max: 150 },
];

async function paginateQuery(buildQuery, onProgress = null, maxPages = 60) {
    let all = [];
    let from = 0;
    let pages = 0;
    while (pages < maxPages) {
        const { data, error } = await buildQuery(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        const rows = data || [];
        all = all.concat(rows);
        pages++;
        if (onProgress) onProgress(`Cargando... ${all.length.toLocaleString('es-AR')} registros`);
        if (rows.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
    }
    return all;
}

export function isInformeVisit(v) {
    const tv = String(v?.tipo_visita || '').toUpperCase();
    return tv.includes('INFORME') || tv.includes('CHQ INF');
}

function getLast7(phone) {
    const d = String(phone || '').replace(/\D/g, '');
    return d.length >= 7 ? d.slice(-7) : '';
}

/**
 * 1. Trae todas las visitas CHQ de recepciones_visitas (2024–2026+)
 */
export async function fetchChequeoVisitas(onProgress = null) {
    return paginateQuery((from, to) =>
        supabase
            .from('recepciones_visitas')
            .select('fecha, dni, paciente, edad, obra_social, centro, asistencia, tipo_visita, tipo_agenda, medico')
            .or('tipo_visita.ilike.%CHQ%,tipo_agenda.ilike.%CHQ%')
            .not('fecha', 'is', null)
            .order('fecha', { ascending: true })
            .range(from, to),
        onProgress
    );
}

/**
 * 2. Trae candidatos de renovación anual (12 meses) desde visitas_chequeo
 */
export async function fetchRenovacionAnualCandidates(onProgress = null) {
    const data = await paginateQuery((from, to) =>
        supabase
            .from('visitas_chequeo')
            .select('fecha, dni, paciente, telefono1, telefono2, obra_social, departamento, centro')
            .or('tipo_visita.ilike.%CHQ%,tipo_agenda.ilike.%CHQ%')
            .ilike('asistencia', 'Presente')
            .not('fecha', 'is', null)
            .not('dni', 'is', null)
            .range(from, to),
        onProgress
    );

    const byDni = {};
    data.forEach(v => {
        if (!v.dni) return;
        const tel1 = v.telefono1 || '';
        const tel2 = v.telefono2 || '';
        if (!byDni[v.dni]) {
            byDni[v.dni] = {
                dni: v.dni,
                paciente: v.paciente,
                telefono1: tel1,
                telefono2: tel2,
                obra_social: v.obra_social,
                departamento: v.departamento,
                centro: v.centro,
                ultima_chq: v.fecha,
                total_chq: 0,
            };
        }
        byDni[v.dni].total_chq++;
        if (!byDni[v.dni].telefono1 && tel1) byDni[v.dni].telefono1 = tel1;
        if (v.fecha > byDni[v.dni].ultima_chq) byDni[v.dni].ultima_chq = v.fecha;
    });

    const now = new Date();
    return Object.values(byDni).map(p => {
        const lastDate = new Date(`${p.ultima_chq}T12:00:00`);
        const monthsSince = (now.getFullYear() - lastDate.getFullYear()) * 12 + (now.getMonth() - lastDate.getMonth());
        return { ...p, meses_desde_ultima: monthsSince };
    }).sort((a, b) => b.meses_desde_ultima - a.meses_desde_ultima);
}

/**
 * 3. Agrega métricas del Circuito Preventivo vs. Informe, Asistencia, Interanual 2024-2026 y Demografía
 */
export function aggregateChequeoAnalytics(rawData = [], {
    fechaDesde = '',
    fechaHasta = '',
    sede = 'TODAS',
    viewType = 'comparativa', // 'comparativa' | 'preventivo' | 'informe'
} = {}) {
    const hoy = new Date().toISOString().split('T')[0];

    const byMonth = {};
    const yoyByYearMonth = {}; // { '2024': { 0..11: Set }, '2025': ..., '2026': ... }
    const uniqueChqAll = new Set();
    const uniqueChqPresentes = new Set();
    const uniqueChqAusentes = new Set();
    const uniqueInfAll = new Set();
    const uniqueInfPresentes = new Set();
    const uniqueInfAusentes = new Set();

    const obraSocialCounts = {};
    const osSeen = new Set();
    const medicoInfCounts = {};
    const centroInfCounts = {};
    const firstChqDateByDni = {};
    const firstInfDateByDni = {};

    const ageBins = AGE_BINS.map(b => ({ ...b, count: 0 }));
    const ageSeen = new Set();
    let ageSum = 0;
    let ageValidCount = 0;

    rawData.forEach(v => {
        if (!v.fecha) return;
        const dni = String(v.dni || v.paciente || '').trim();
        if (!dni) return;

        // Filtro sede
        if (sede !== 'TODAS') {
            const c = String(v.centro || '').toUpperCase();
            if (sede === 'SANTA FE' && !c.includes('SANTA FE')) return;
            if (sede === 'SAN LUIS' && !c.includes('SAN LUIS')) return;
        }

        const isInf = isInformeVisit(v);
        const asis = v.asistencia || (v.fecha < hoy ? 'Ausente' : 'Pendiente');
        const isPresente = String(asis).toLowerCase() === 'presente';
        const isAusente = String(asis).toLowerCase().includes('ausen');
        const isPendiente = !isPresente && !isAusente && v.fecha >= hoy;

        // Interanual (independiente del rango de fechas, respeta sede y viewType)
        const yr = v.fecha.substring(0, 4);
        const moIdx = parseInt(v.fecha.substring(5, 7), 10) - 1;
        if (['2024', '2025', '2026'].includes(yr) && moIdx >= 0 && moIdx <= 11 && isPresente) {
            const matchType = (viewType === 'informe' && isInf) || (viewType !== 'informe' && !isInf);
            if (matchType) {
                if (!yoyByYearMonth[yr]) yoyByYearMonth[yr] = Array.from({ length: 12 }, () => new Set());
                yoyByYearMonth[yr][moIdx].add(dni);
            }
        }

        // Filtro por rango de fechas para el período seleccionado
        if (fechaDesde && v.fecha < fechaDesde) return;
        if (fechaHasta && v.fecha > fechaHasta) return;

        const month = v.fecha.substring(0, 7);
        if (!byMonth[month]) {
            byMonth[month] = {
                chqAll: new Set(),
                chqPresentes: new Set(),
                chqAusentes: new Set(),
                chqPendientes: new Set(),
                infAll: new Set(),
                infPresentes: new Set(),
                infAusentes: new Set(),
                infPendientes: new Set(),
            };
        }

        if (isInf) {
            uniqueInfAll.add(dni);
            byMonth[month].infAll.add(dni);
            if (isPresente) {
                uniqueInfPresentes.add(dni);
                byMonth[month].infPresentes.add(dni);
                if (!firstInfDateByDni[dni] || v.fecha > firstInfDateByDni[dni]) firstInfDateByDni[dni] = v.fecha;
                if (v.medico) medicoInfCounts[v.medico] = (medicoInfCounts[v.medico] || 0) + 1;
                const cLabel = String(v.centro || '').toUpperCase().includes('SAN LUIS') ? 'San Luis' : (v.centro ? 'Santa Fe' : 'Sin Sede');
                centroInfCounts[cLabel] = (centroInfCounts[cLabel] || 0) + 1;
            } else if (isAusente) {
                uniqueInfAusentes.add(dni);
                byMonth[month].infAusentes.add(dni);
            } else if (isPendiente) {
                byMonth[month].infPendientes.add(dni);
            }
        } else {
            uniqueChqAll.add(dni);
            byMonth[month].chqAll.add(dni);
            if (isPresente) {
                uniqueChqPresentes.add(dni);
                byMonth[month].chqPresentes.add(dni);
                if (!firstChqDateByDni[dni] || v.fecha < firstChqDateByDni[dni]) firstChqDateByDni[dni] = v.fecha;
            } else if (isAusente) {
                uniqueChqAusentes.add(dni);
                byMonth[month].chqAusentes.add(dni);
            } else if (isPendiente) {
                byMonth[month].chqPendientes.add(dni);
            }
        }

        if (isPresente) {
            const matchType = (viewType === 'informe' && isInf) || (viewType !== 'informe' && !isInf);
            if (matchType) {
                const osKey = `${dni}_${isInf ? 'INF' : 'CHQ'}`;
                if (!osSeen.has(osKey)) {
                    osSeen.add(osKey);
                    const os = (v.obra_social || 'Particular / Sin OS').replace(/^\d+\s*-\s*/, '').trim();
                    obraSocialCounts[os] = (obraSocialCounts[os] || 0) + 1;
                }
                const edadNum = Number(v.edad);
                if (!ageSeen.has(dni) && Number.isFinite(edadNum) && edadNum > 0 && edadNum <= 115) {
                    ageSeen.add(dni);
                    ageSum += edadNum;
                    ageValidCount++;
                    const bin = ageBins.find(b => edadNum >= b.min && edadNum <= b.max);
                    if (bin) bin.count++;
                }
            }
        }
    });

    // Demora promedio al informe (días)
    let totalDiasDemora = 0;
    let countDemora = 0;
    uniqueChqPresentes.forEach(dni => {
        if (uniqueInfPresentes.has(dni)) {
            const fChq = firstChqDateByDni[dni];
            const fInf = firstInfDateByDni[dni];
            if (fChq && fInf && fInf >= fChq) {
                const diff = Math.round((new Date(`${fInf}T12:00:00`) - new Date(`${fChq}T12:00:00`)) / (1000 * 60 * 60 * 24));
                if (diff >= 0 && diff <= 120) {
                    totalDiasDemora += diff;
                    countDemora++;
                }
            }
        }
    });

    const avgDiasInforme = countDemora > 0 ? Math.round(totalDiasDemora / countDemora) : 0;
    const tasaRetornoInforme = uniqueChqPresentes.size > 0
        ? Math.round((uniqueInfPresentes.size / uniqueChqPresentes.size) * 100)
        : 0;

    const months = Object.keys(byMonth).sort().map(m => {
        const curr = byMonth[m];
        const chqPres = curr.chqPresentes.size;
        const chqAus = curr.chqAusentes.size;
        const chqPend = curr.chqPendientes.size;
        const infPres = curr.infPresentes.size;
        const infAus = curr.infAusentes.size;
        const infPend = curr.infPendientes.size;

        const targetPres = viewType === 'informe' ? infPres : chqPres;
        const targetAus = viewType === 'informe' ? infAus : chqAus;
        const resolved = targetPres + targetAus;
        const tasaAsistenciaMes = resolved > 0 ? Math.round((targetPres / resolved) * 100) : 0;
        const tasaRetornoMes = chqPres > 0 ? Math.round((infPres / chqPres) * 100) : 0;

        const [y, mo] = m.split('-');
        return {
            month: m,
            label: `${MONTH_NAMES[parseInt(mo, 10) - 1]} ${y.slice(2)}`,
            labelFull: `${MONTH_NAMES[parseInt(mo, 10) - 1]} ${y}`,
            agendados: curr.chqAll.size,
            presentes: chqPres,
            ausentes: chqAus,
            pendientes: chqPend,
            infAgendados: curr.infAll.size,
            infPresentes: infPres,
            infAusentes: infAus,
            infPendientes: infPend,
            tasaAsistenciaMes,
            tasaRetornoMes,
        };
    });

    const yoyData = MONTH_NAMES.map((name, idx) => ({
        label: name,
        y2024: yoyByYearMonth['2024']?.[idx]?.size || 0,
        y2025: yoyByYearMonth['2025']?.[idx]?.size || 0,
        y2026: yoyByYearMonth['2026']?.[idx]?.size || 0,
    }));

    const sortedOS = Object.entries(obraSocialCounts).sort((a, b) => b[1] - a[1]);
    const topOS = sortedOS.slice(0, 6).map(([name, value]) => ({ name, value }));
    const othersOS = sortedOS.slice(6).reduce((s, [, v]) => s + v, 0);
    if (othersOS > 0) topOS.push({ name: 'Otras', value: othersOS });

    const topMedicosInf = Object.entries(medicoInfCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([name, value]) => ({ name, value }));

    const centrosInf = Object.entries(centroInfCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([name, value]) => ({ name, value }));

    const totalResolvedChq = uniqueChqPresentes.size + uniqueChqAusentes.size;
    const tasaAsistenciaGlobal = totalResolvedChq > 0
        ? Math.round((uniqueChqPresentes.size / totalResolvedChq) * 100)
        : 0;
    const avgAge = ageValidCount > 0 ? Math.round((ageSum / ageValidCount) * 10) / 10 : 0;

    return {
        months,
        yoyData,
        uniquePatients: uniqueChqPresentes.size,
        totalAgendados: uniqueChqAll.size,
        uniqueAusentes: uniqueChqAusentes.size,
        uniqueInfPresentes: uniqueInfPresentes.size,
        totalInfAgendados: uniqueInfAll.size,
        uniqueInfAusentes: uniqueInfAusentes.size,
        tasaRetornoInforme,
        tasaAsistenciaGlobal,
        avgDiasInforme,
        avgAge,
        ageValidCount,
        ageDistribution: ageBins,
        topOS,
        topMedicosInf,
        centrosInf,
    };
}

/**
 * 4. Embudo de Conversión WhatsApp (line_recepciones) → SALUS (salus_turnos_conversion)
 */
export async function fetchConversionWhatsAppData({ startDate, endDate }) {
    const startIso = `${startDate}T00:00:00-03:00`;
    const endPlus30 = new Date(`${endDate}T23:59:59-03:00`);
    endPlus30.setDate(endPlus30.getDate() + 30);
    const endPlus30Iso = endPlus30.toISOString();

    const [messages, turnos] = await Promise.all([
        paginateQuery((from, to) =>
            supabase
                .from('whatsapp_messages')
                .select('phone, direction, created_at, sender_name, content')
                .eq('line_id', 'line_recepciones')
                .gte('created_at', startIso)
                .lte('created_at', endPlus30Iso)
                .order('created_at', { ascending: true })
                .range(from, to)
        ),
        paginateQuery((from, to) =>
            supabase
                .from('salus_turnos_conversion')
                .select('id_visita, paciente, dni, edad, sexo, obra_social, centro, especialidad, medico, tipo_visita, categoria_turno, fecha_visita, hora_visita, fecha_creacion, usuario_creacion, asistencia, tel1_last7, tel2_last7, synced_at')
                .gte('fecha_visita', startDate)
                .order('fecha_visita', { ascending: true })
                .range(from, to)
        ),
    ]);

    return { messages, turnos };
}

export function computeConversionWhatsApp(rawData, {
    startDate,
    endDate,
    attributionMode = 'strict',
    attributionDays = 14,
    categoriaFilter = 'all',
} = {}) {
    if (!rawData) return null;
    const { messages = [], turnos = [] } = rawData;

    const startMs = new Date(`${startDate}T00:00:00-03:00`).getTime();
    const endMs = new Date(`${endDate}T23:59:59-03:00`).getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs > endMs) return null;

    const todayStr = new Date().toISOString().slice(0, 10);
    const diffDays = Math.max(1, Math.round((endMs - startMs) / (1000 * 60 * 60 * 24)));
    const granularity = diffDays <= 45 ? 'diaria' : diffDays <= 120 ? 'semanal' : 'mensual';

    const getBucket = (dateStr) => {
        if (granularity === 'mensual') {
            const [y, m] = dateStr.split('-');
            return { key: `${y}-${m}`, label: `${MONTH_NAMES[parseInt(m, 10) - 1] || m} ${y.slice(2)}` };
        }
        if (granularity === 'semanal') {
            const d = new Date(`${dateStr}T12:00:00`);
            const day = d.getDay();
            d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
            const k = d.toISOString().slice(0, 10);
            return { key: k, label: `Sem ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}` };
        }
        const [, m, dd] = dateStr.split('-');
        return { key: dateStr, label: `${dd}/${m}` };
    };

    const byPhone = new Map();
    for (const m of messages) {
        const ts = new Date(m.created_at).getTime();
        if (!byPhone.has(m.phone)) {
            byPhone.set(m.phone, { phone: m.phone, last7: getLast7(m.phone), senderName: '', incInPeriod: [], outAll: [] });
        }
        const e = byPhone.get(m.phone);
        if (m.direction === 'incoming') {
            if (m.sender_name && !e.senderName) e.senderName = m.sender_name;
            if (ts >= startMs && ts <= endMs) e.incInPeriod.push({ ts, created_at: m.created_at });
        } else {
            const isBot = (m.sender_name || '').includes('Dora') || (m.content || '').includes('Encuesta de Satisfacción');
            if (!isBot) e.outAll.push({ ts, created_at: m.created_at });
        }
    }

    const turnosByLast7 = new Map();
    for (const t of turnos) {
        if (categoriaFilter !== 'all' && t.categoria_turno !== categoriaFilter) continue;
        [t.tel1_last7, t.tel2_last7].filter(Boolean).forEach(k => {
            if (!turnosByLast7.has(k)) turnosByLast7.set(k, []);
            turnosByLast7.get(k).push(t);
        });
    }

    const dailyMap = new Map();
    const cur = new Date(`${startDate}T12:00:00`);
    const endD = new Date(`${endDate}T12:00:00`);
    let guard = 0;
    while (cur <= endD && guard < 1500) {
        guard++;
        const iso = cur.toISOString().slice(0, 10);
        const { key, label } = getBucket(iso);
        if (!dailyMap.has(key)) dailyMap.set(key, { key, label, ingresadas: 0, respondidas: 0, asignados: 0, concretados: 0 });
        cur.setDate(cur.getDate() + 1);
    }

    const windowMs = attributionDays * 86400000;
    let totalIngresadas = 0, totalRespondidas = 0, totalAsignados = 0, totalConcretados = 0, totalFuturos = 0;
    const frtList = [];
    const asistenciaCounts = { Presente: 0, 'Futuro Pendiente': 0, 'Ausencia Justificada': 0, 'Ausencia Injustificada': 0, 'Sin marcar': 0 };
    const tipoTurnoCounts = {};
    const sedeMap = {};
    const osMap = {};
    const sexoCounts = { Mujer: 0, Hombre: 0, 'Sin dato': 0 };
    const auditRows = [];

    for (const entry of byPhone.values()) {
        if (!entry.incInPeriod.length) continue;
        totalIngresadas++;
        const firstInc = entry.incInPeriod[0];
        const firstDate = new Date(firstInc.ts).toLocaleDateString('en-CA', { timeZone: 'America/Argentina/San_Juan' });

        const firstReply = entry.outAll.find(o => o.ts >= firstInc.ts);
        const respondida = Boolean(firstReply);
        let frtMin = null;
        if (respondida) {
            totalRespondidas++;
            frtMin = Math.round((firstReply.ts - firstInc.ts) / 60000);
            if (frtMin >= 0 && frtMin <= 4320) frtList.push(frtMin);
        }

        const cands = entry.last7 ? (turnosByLast7.get(entry.last7) || []) : [];
        const matched = cands.filter(t => {
            if (attributionMode === 'strict') {
                if (!t.fecha_creacion) return false;
                const cms = new Date(t.fecha_creacion).getTime();
                return cms >= (firstInc.ts - 600000) && cms <= (firstInc.ts + windowMs);
            }
            const vms = new Date(`${t.fecha_visita}T23:59:59-03:00`).getTime();
            return t.fecha_visita >= firstDate && vms <= (firstInc.ts + 60 * 86400000);
        });
        const uniqueTurnos = [...new Map(matched.map(t => [t.id_visita, t])).values()];
        const hasTurno = uniqueTurnos.length > 0;

        let estadoPaciente = 'Sin turno';
        let best = null;
        if (hasTurno) {
            totalAsignados++;
            const pres = uniqueTurnos.find(t => (t.asistencia || '').toLowerCase() === 'presente');
            const fut = uniqueTurnos.find(t => t.fecha_visita >= todayStr);
            best = pres || fut || uniqueTurnos[0];
            const an = (best.asistencia || '').trim().toLowerCase();

            if (pres) { totalConcretados++; estadoPaciente = 'Concretado'; asistenciaCounts.Presente++; }
            else if (best.fecha_visita >= todayStr) { totalFuturos++; estadoPaciente = 'Pendiente Futuro'; asistenciaCounts['Futuro Pendiente']++; }
            else if (an.includes('justificada') && !an.includes('injustificada')) { estadoPaciente = 'Ausencia Justificada'; asistenciaCounts['Ausencia Justificada']++; }
            else if (an.includes('injustificada')) { estadoPaciente = 'Ausencia Injustificada'; asistenciaCounts['Ausencia Injustificada']++; }
            else { estadoPaciente = 'Ausente / Sin marcar'; asistenciaCounts['Sin marcar']++; }

            const cat = best.categoria_turno || 'Otros Ambulatorios';
            tipoTurnoCounts[cat] = (tipoTurnoCounts[cat] || 0) + 1;

            const sr = String(best.centro || 'Sin sede').toUpperCase();
            const sedeName = sr.includes('SANTA FE') ? 'Sede Santa Fe' : sr.includes('SAN LUIS') ? 'Sede San Luis' : (best.centro || 'Sin sede');
            if (!sedeMap[sedeName]) sedeMap[sedeName] = { sede: sedeName, asignados: 0, concretados: 0 };
            sedeMap[sedeName].asignados++;
            if (pres) sedeMap[sedeName].concretados++;

            const os = (best.obra_social || 'Particular / Sin dato').replace(/^\d+\s*-\s*/, '').trim();
            if (!osMap[os]) osMap[os] = { obraSocial: os, asignados: 0, concretados: 0 };
            osMap[os].asignados++;
            if (pres) osMap[os].concretados++;

            const sx = (best.sexo || '').toLowerCase();
            if (sx.includes('mujer') || sx === 'f') sexoCounts.Mujer++;
            else if (sx.includes('hombre') || sx.includes('masc') || sx === 'm') sexoCounts.Hombre++;
            else sexoCounts['Sin dato']++;
        }

        const { key: bk } = getBucket(firstDate);
        if (dailyMap.has(bk)) {
            const b = dailyMap.get(bk);
            b.ingresadas++;
            if (respondida) b.respondidas++;
            if (hasTurno) b.asignados++;
            if (estadoPaciente === 'Concretado') b.concretados++;
        }

        auditRows.push({
            phone: entry.phone,
            paciente: best?.paciente || entry.senderName || entry.phone,
            dni: best?.dni || '',
            fechaConsulta: firstInc.created_at,
            respondida,
            frtMinutes: frtMin,
            tieneTurno: hasTurno,
            fechaVisita: best?.fecha_visita || '—',
            tipoTurno: best?.categoria_turno || '—',
            obraSocial: best?.obra_social || '—',
            centro: best?.centro || '—',
            estadoPaciente,
        });
    }

    const sortedFrt = [...frtList].sort((a, b) => a - b);
    const medianFrt = sortedFrt.length ? sortedFrt[Math.floor(sortedFrt.length / 2)] : 0;
    const pct = (n, d) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);

    return {
        kpis: {
            ingresadas: totalIngresadas,
            respondidas: totalRespondidas,
            asignados: totalAsignados,
            concretados: totalConcretados,
            futurosPendientes: totalFuturos,
            tasaRespuesta: pct(totalRespondidas, totalIngresadas),
            tasaConversion: pct(totalAsignados, totalIngresadas),
            tasaConcrecion: pct(totalConcretados, Math.max(0, totalAsignados - totalFuturos)),
            medianFrtMinutes: medianFrt,
        },
        funnelStages: [
            { label: 'Consultas WA', value: totalIngresadas, color: '#0284C7', pct: 100 },
            { label: 'Respondidas', value: totalRespondidas, color: '#6366F1', pct: pct(totalRespondidas, totalIngresadas) },
            { label: 'Turno SALUS', value: totalAsignados, color: '#0EA5E9', pct: pct(totalAsignados, totalIngresadas) },
            { label: 'Asistió', value: totalConcretados, color: '#10B981', pct: pct(totalConcretados, totalIngresadas) },
        ],
        dailySeries: [...dailyMap.values()],
        granularity,
        asistenciaPie: Object.entries(asistenciaCounts).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value })),
        tipoTurnoPie: Object.entries(tipoTurnoCounts).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
        sedeBars: Object.values(sedeMap).sort((a, b) => b.asignados - a.asignados),
        obraSocialBars: Object.values(osMap).sort((a, b) => b.asignados - a.asignados).slice(0, 8),
        sexoPie: Object.entries(sexoCounts).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value })),
        auditRows: auditRows.sort((a, b) => new Date(b.fechaConsulta) - new Date(a.fechaConsulta)),
    };
}

/**
 * 5. Encuestas de Calidad Post-Chequeo (Edge Function get-encuestas-metrics + fallback tabla encuestas_preventivos)
 */
export async function fetchEncuestasCalidadChequeo() {
    try {
        const { data, error } = await supabase.functions.invoke('get-encuestas-metrics', { method: 'POST' });
        if (!error && Array.isArray(data?.data)) return data.data;
    } catch (_) { /* fallback abajo */ }

    const { data } = await supabase
        .from('encuestas_preventivos')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1000);
    return data || [];
}
