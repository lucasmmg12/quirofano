/**
 * incentivoContactCenterService.js
 * Servicio de liquidación, proyección y auditoría del Esquema de Incentivos y Productividad
 * para el equipo del Contact Center de Sanatorio Argentino (Propuesta v13).
 */

import { supabase } from '../lib/supabase';
import { getSalusSyncBaseUrl } from './salusSync';

// Base Garantizada Histórica (100% Inamovible)
export const BASE_GARANTIZADA_HISTORICA = 139470.59;
export const MAX_VARIABLE_TOTAL = 139470.59;
export const TECHO_MAXIMO_TOTAL = 278941.18;

// Configuración Oficial de las 3 Bolsas Independientes (Regla 50 / 25 / 25)
export const INCENTIVO_CONFIG = {
    bolsas: {
        mensajes: {
            nombre: 'Conversaciones Únicas (Ventana 24 hs)',
            alcance: 'Grupal',
            ponderacion: 0.50,
            maxMonto: 69735.29,
            base: 6500,
            meta: 7500,
            tope: 8500,
            paso: 200,
            montoPaso: 6973.53,
            unidad: 'conversaciones'
        },
        turnos: {
            nombre: 'Turnos Otorgados',
            alcance: 'Grupal',
            ponderacion: 0.25,
            maxMonto: 34867.65,
            base: 3052,
            meta: 3687,
            tope: 4324,
            paso: 127,
            montoPaso: 3486.76,
            unidad: 'turnos'
        },
        asistencia: {
            nombre: 'Asistencia Efectiva de Pacientes',
            alcance: 'Individual',
            ponderacion: 0.25,
            maxMonto: 34867.65,
            base: 50.0,
            meta: 55.0,
            tope: 60.0,
            paso: 1.0,
            montoPaso: 3486.76,
            unidad: '%'
        }
    }
};

/** Mensajes auditados de referencia por operadora (Septiembre / Proyección Octubre) */
export const MENSAJES_INDIVIDUALES_REF = {
    vjacques: 2505, // Virginia
    solivier: 2435, // Sofia
    daguilera: 1903, // Daniela
    eleal: 1744,     // Erica
    macosta: 0       // Antonella (baja)
};
export const TOTAL_MENSAJES_REF = 2505 + 2435 + 1903 + 1744; // 8.587 (Escalón 10 / Tope)

/** Mensajes auditados de Agosto 2026 */
export const MENSAJES_INDIVIDUALES_AGOSTO = {
    solivier: 2256, // Sofia (fila 2)
    macosta: 2036,  // Antonella (fila 3)
    vjacques: 1622, // Virginia (fila 4)
    eleal: 732,     // Erica (fila 5)
    daguilera: 0    // Daniela (fila 1 a confirmar)
};

/**
 * Tabla oficial de escalones progresivos (0 a 10)
 */
export function getEscalonesInfo(tipo) {
    const b = INCENTIVO_CONFIG.bolsas[tipo];
    if (!b) return [];

    const escalones = [];
    for (let i = 0; i <= 10; i++) {
        let desde = 0;
        let hasta = 0;
        let monto = Math.round(i * b.montoPaso * 100) / 100;

        if (tipo === 'mensajes') {
            desde = i === 0 ? 0 : b.base + (i - 1) * b.paso;
            hasta = i === 10 ? Infinity : b.base + i * b.paso - 1;
        } else if (tipo === 'turnos') {
            desde = i === 0 ? 0 : b.base + (i - 1) * b.paso;
            hasta = i === 10 ? Infinity : b.base + i * b.paso - 1;
        } else if (tipo === 'asistencia') {
            desde = i === 0 ? 0 : b.base + (i - 1) * b.paso;
            hasta = i === 10 ? 100 : b.base + i * b.paso - 0.01;
        }

        escalones.push({
            escalon: i,
            desde,
            hasta,
            monto,
            esMeta: i === 5,
            esTope: i === 10
        });
    }
    return escalones;
}

/**
 * Calcula el escalón alcanzado (0 a 10) dado un valor numérico
 */
export function calculateEscalon(valor, tipo) {
    const b = INCENTIVO_CONFIG.bolsas[tipo];
    if (!b || valor === null || valor === undefined) {
        return { escalon: 0, monto: 0, progresoPct: 0 };
    }

    const num = Number(valor);
    if (isNaN(num) || num < b.base + (tipo === 'asistencia' ? 1.0 : tipo === 'turnos' ? 127 : 200)) {
        return { 
            escalon: 0, 
            monto: 0, 
            progresoPct: Math.min(100, Math.round((num / b.base) * 100)) 
        };
    }

    let escalon = 0;
    if (tipo === 'asistencia') {
        escalon = Math.floor(num - b.base);
    } else {
        escalon = Math.floor((num - b.base) / b.paso);
    }

    escalon = Math.max(0, Math.min(10, escalon));
    const monto = Math.round(escalon * b.montoPaso * 100) / 100;
    const progresoPct = Math.min(100, Math.round((num / b.tope) * 100));

    return { escalon, monto, progresoPct };
}

/**
 * Obtiene las métricas oficiales de SALUS para el período seleccionado.
 * Prioriza la lectura directa de Supabase (Cloud-First), lo que permite que funcione
 * instantáneamente en Vercel, móviles e intranet sin requerir conexión LAN directa.
 */
export async function fetchMetricasIncentivosSalus(periodo, { forceRefresh = false } = {}) {
    // 1. Intento Cloud-First: consultar snapshot en Supabase app_config
    if (!forceRefresh) {
        try {
            const { data: row, error } = await supabase
                .from('app_config')
                .select('value, updated_at')
                .eq('key', `cc_incentivo_${periodo}`)
                .maybeSingle();

            if (!error && row?.value) {
                const parsed = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
                if (parsed && (parsed.turnosGrupales || parsed.agentes)) {
                    return { success: true, data: parsed, source: 'supabase', updatedAt: row.updated_at };
                }
            }
        } catch (supaErr) {
            console.warn('[incentivos] Error leyendo snapshot de Supabase:', supaErr);
        }
    }

    // 2. Si se fuerza refresh o no está en Supabase, probar endpoint directo si hay sync-server local
    const base = getSalusSyncBaseUrl();
    if (base) {
        try {
            const url = `${base}/api/salus/incentivos-contact-center?periodo=${encodeURIComponent(periodo)}`;
            const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
            const contentType = res.headers.get('content-type') || '';
            if (res.ok && contentType.includes('application/json')) {
                const json = await res.json();
                const payload = json.data || json;
                if (json.success && (payload.turnosGrupales || payload.agentes)) {
                    return { success: true, data: payload, source: 'sync_direct', updatedAt: new Date().toISOString() };
                }
            }
        } catch (directErr) {
            console.warn('[incentivos] No se pudo conectar al sync-server local:', directErr.message);
        }
    }

    // 3. Fallback en Supabase
    try {
        const { data: row } = await supabase
            .from('app_config')
            .select('value, updated_at')
            .eq('key', `cc_incentivo_${periodo}`)
            .maybeSingle();

        if (row?.value) {
            const parsed = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
            if (parsed && (parsed.turnosGrupales || parsed.agentes)) {
                return { success: true, data: parsed, source: 'supabase', updatedAt: row.updated_at };
            }
        }
    } catch (_) {}

    throw new Error(`Aún no hay métricas sincronizadas para el período ${periodo}. Haz clic en "Actualizar SALUS" o verifica que el servidor central esté operativo.`);
}

/**
 * Consulta la cantidad de conversaciones únicas o mensajes del Contact Center en Supabase para el mes
 */
export async function fetchMensajesContactCenterMes(periodo) {
    try {
        const parts = periodo.split('-');
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        const startIso = `${periodo}-01T00:00:00`;
        const nextMonth = m === 12 ? 1 : m + 1;
        const nextYear = m === 12 ? y + 1 : y;
        const endIso = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01T00:00:00`;

        // 1. Priorizar conteo real de conversaciones únicas en contact_center_conversations
        const { count: convCount, error: convErr } = await supabase
            .from('contact_center_conversations')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', startIso)
            .lt('created_at', endIso);

        if (!convErr && convCount !== null && convCount > 0) {
            return convCount;
        }

        // 2. Si no hay conversaciones creadas, consultar whatsapp_messages
        const { count, error } = await supabase
            .from('whatsapp_messages')
            .select('*', { count: 'exact', head: true })
            .eq('line_id', 'contact_center')
            .gte('created_at', startIso)
            .lt('created_at', endIso);

        if (error) {
            console.warn('[incentivos] Error consultando whatsapp_messages:', error.message);
            return 0;
        }
        return count || 0;
    } catch (err) {
        console.warn('[incentivos] Error obteniendo mensajes de Supabase:', err);
        return 0;
    }
}

/**
 * Calcula la liquidación completa del Contact Center para un período
 */
export function calcularLiquidacionCompleta({
    periodo,
    mensajesTotales,
    datosSalus,
    ajustesFte = {}
}) {
    const escalonMensajes = calculateEscalon(mensajesTotales, 'mensajes');
    const escalonTurnos = calculateEscalon(datosSalus?.turnosGrupales?.total || 0, 'turnos');

    const listaAgentes = (datosSalus?.agentes || []).map(ag => {
        const fteCustom = ajustesFte[ag.id] !== undefined ? ajustesFte[ag.id] : ag.fte;
        const fte = Math.max(0, Math.min(1.0, Number(fteCustom)));

        // Piso Garantizado (Base):
        // Érica Leal y todos los agentes activos / en curva de aprendizaje cobran el piso garantizado histórico inamovible ($139.470,59).
        // El FTE proporcional (ej: 50% en curva de aprendizaje) aplica a las bolsas de incentivos variables (Msjs, Turnos, Asistencia).
        // Únicamente se prorratea el piso garantizado por FTE en caso de bajas definitivas por días trabajados (ej: Antonella Acosta en septiembre).
        const base = (ag.id === 'eleal' || ag.estado !== 'BAJA')
            ? BASE_GARANTIZADA_HISTORICA
            : BASE_GARANTIZADA_HISTORICA * fte;

        const montoMensajes = escalonMensajes.monto * fte;
        const montoTurnos = escalonTurnos.monto * fte;
        const montoAsistencia = (ag.montoAsistencia || 0) * fte;

        const totalVariable = montoMensajes + montoTurnos + montoAsistencia;
        const totalALiquidar = base + totalVariable;

        const mapaRef = periodo === '2026-08' ? MENSAJES_INDIVIDUALES_AGOSTO : MENSAJES_INDIVIDUALES_REF;
        const mensajesIndiv = ag.mensajesIndividuales !== undefined
            ? ag.mensajesIndividuales
            : (mapaRef[ag.id] || 0);

        return {
            ...ag,
            fte,
            mensajesIndividuales: mensajesIndiv,
            baseGarantizadaLiquidada: Math.round(base * 100) / 100,
            montoMensajes: Math.round(montoMensajes * 100) / 100,
            montoTurnos: Math.round(montoTurnos * 100) / 100,
            montoAsistencia: Math.round(montoAsistencia * 100) / 100,
            totalVariable: Math.round(totalVariable * 100) / 100,
            totalALiquidar: Math.round(totalALiquidar * 100) / 100
        };
    }).filter(ag => !(periodo >= '2026-10' && ag.id === 'macosta') && !(ag.fte === 0 && (ag.estado === 'BAJA' || ag.id === 'macosta')));

    const totalGeneralLiquidacion = listaAgentes.reduce((acc, a) => acc + a.totalALiquidar, 0);
    const totalGeneralVariable = listaAgentes.reduce((acc, a) => acc + a.totalVariable, 0);
    const totalGeneralBase = listaAgentes.reduce((acc, a) => acc + a.baseGarantizadaLiquidada, 0);

    return {
        periodo,
        bolsaMensajes: {
            total: mensajesTotales,
            escalon: escalonMensajes.escalon,
            montoPorFte: escalonMensajes.monto,
            progresoPct: escalonMensajes.progresoPct,
            meta: INCENTIVO_CONFIG.bolsas.mensajes.meta,
            tope: INCENTIVO_CONFIG.bolsas.mensajes.tope
        },
        bolsaTurnos: {
            total: datosSalus?.turnosGrupales?.total || 0,
            escalon: escalonTurnos.escalon,
            montoPorFte: escalonTurnos.monto,
            progresoPct: escalonTurnos.progresoPct,
            meta: INCENTIVO_CONFIG.bolsas.turnos.meta,
            tope: INCENTIVO_CONFIG.bolsas.turnos.tope
        },
        agentes: listaAgentes,
        totalesEquipo: {
            baseTotal: Math.round(totalGeneralBase * 100) / 100,
            variableTotal: Math.round(totalGeneralVariable * 100) / 100,
            liquidacionTotal: Math.round(totalGeneralLiquidacion * 100) / 100
        }
    };
}

/**
 * Guarda el número de conversaciones únicas auditadas para un período en Supabase
 */
export async function guardarConversacionesAuditadasMes(periodo, conversaciones) {
    const num = parseInt(conversaciones, 10) || 0;
    try {
        const { data: row } = await supabase
            .from('app_config')
            .select('value')
            .eq('key', `cc_incentivo_${periodo}`)
            .maybeSingle();

        let parsed = {};
        if (row?.value) {
            parsed = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
        }

        parsed.conversacionesUnicas = num;
        parsed.updated_at = new Date().toISOString();

        await supabase.from('app_config').upsert({
            key: `cc_incentivo_${periodo}`,
            value: JSON.stringify(parsed),
            label: `Métricas de Incentivos Contact Center ${periodo}`,
            category: 'incentivos_contact_center',
            updated_at: new Date().toISOString(),
            updated_by: 'supervisor_auditoria'
        });

        return { success: true, conversaciones: num };
    } catch (e) {
        console.error('Error guardando conversaciones auditadas:', e);
        throw e;
    }
}

/**
 * Obtiene y procesa la comparación histórica mes a mes para los gráficos de performance y comparativa,
 * respondiendo dinámicamente al período seleccionado en el filtro superior.
 */
export async function fetchHistoricoComparativoIncentivos(periodo = '2026-10') {
    try {
        const { data: rows, error } = await supabase
            .from('app_config')
            .select('key, value')
            .like('key', 'cc_incentivo_%');

        if (error) throw error;

        const monthsData = {};
        (rows || []).forEach(r => {
            const p = r.key.replace('cc_incentivo_', '');
            monthsData[p] = typeof r.value === 'string' ? JSON.parse(r.value) : r.value;
        });

        // Determinar mes seleccionado y mes anterior de comparación
        const [y, m] = (periodo || '2026-10').split('-').map(Number);
        const prevM = m === 1 ? 12 : m - 1;
        const prevY = m === 1 ? y - 1 : y;
        const prevPeriod = `${prevY}-${String(prevM).padStart(2, '0')}`;

        const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        const labelActual = `${monthNames[m - 1]} ${y}`;
        const labelAnterior = `${monthNames[prevM - 1]} ${prevY}`;

        const curr = monthsData[periodo] || {};
        const prev = monthsData[prevPeriod] || {};

        const agentesPrev = {};
        (prev.agentes || []).forEach(a => { agentesPrev[a.id] = a; });

        const agentesCurr = {};
        (curr.agentes || []).forEach(a => { agentesCurr[a.id] = a; });

        const agentOrder = (periodo >= '2026-10')
            ? ['solivier', 'vjacques', 'daguilera', 'eleal']
            : ['solivier', 'vjacques', 'daguilera', 'eleal', 'macosta'];
        const agentNames = {
            solivier: 'Sofia Olivier',
            vjacques: 'Virginia Jacques',
            daguilera: 'Daniela Aguilera',
            eleal: 'Erica Leal',
            macosta: 'Antonella Acosta'
        };

        const comparativoAgentes = agentOrder.map(id => {
            const aPrev = agentesPrev[id] || {};
            const aCurr = agentesCurr[id] || {};

            const turnosPrev = aPrev.turnos || 0;
            const turnosCurr = aCurr.turnos || 0;
            const turnosDiff = turnosCurr - turnosPrev;
            const turnosPct = turnosPrev > 0 ? Math.round((turnosDiff / turnosPrev) * 100) : 0;

            const asistPrev = aPrev.asistenciaPct || 0;
            const asistCurr = aCurr.asistenciaPct || 0;
            const asistDiff = Math.round((asistCurr - asistPrev) * 100) / 100;

            const msjsRefPrev = prevPeriod === '2026-09' ? MENSAJES_INDIVIDUALES_REF : MENSAJES_INDIVIDUALES_AGOSTO;
            const msjsRefCurr = periodo === '2026-09' ? MENSAJES_INDIVIDUALES_REF : periodo === '2026-08' ? MENSAJES_INDIVIDUALES_AGOSTO : {};

            const msjsPrev = aPrev.mensajesIndividuales || msjsRefPrev[id] || 0;
            const msjsCurr = aCurr.mensajesIndividuales || msjsRefCurr[id] || (periodo === '2026-10' ? (id === 'vjacques' ? 2505 : id === 'solivier' ? 2435 : id === 'daguilera' ? 1903 : id === 'eleal' ? 1744 : 0) : 0);
            const msjsDiff = msjsCurr - msjsPrev;
            const msjsPct = msjsPrev > 0 ? Math.round((msjsDiff / msjsPrev) * 100) : 0;

            const varPrev = (aPrev.montoAsistencia || 0) + (aPrev.montoTurnos || 0);
            const varCurr = (aCurr.montoAsistencia || 0) + (aCurr.montoTurnos || 0);
            const varDiff = varCurr - varPrev;

            return {
                id,
                name: agentNames[id] || aCurr.name || aPrev.name || id,
                shortName: (agentNames[id] || id).split(' ')[0],
                // Métricas dinámicas prev vs curr
                turnosPrev,
                turnosCurr,
                turnosDiff,
                turnosPct,
                asistPrev,
                asistCurr,
                asistDiff,
                msjsPrev,
                msjsCurr,
                msjsDiff,
                msjsPct,
                varPrev,
                varCurr,
                varDiff,
                ftePrev: aPrev.fte ?? 1.0,
                fteCurr: aCurr.fte ?? (id === 'macosta' ? 0 : id === 'eleal' ? 0.5 : 1.0),
                estadoPrev: aPrev.estado || 'ACTIVA',
                estadoCurr: aCurr.estado || (id === 'macosta' ? 'BAJA' : 'ACTIVA')
            };
        });

        // Insights dinámicos basados en la producción real
        const agentesActivos = comparativoAgentes.filter(a => a.turnosCurr > 0 || a.turnosPrev > 0);

        // 1. Líder en Turnos
        const sortedTurnos = [...agentesActivos].sort((a, b) => b.turnosCurr - a.turnosCurr);
        const liderTurnos = sortedTurnos[0] || { name: '—', turnosCurr: 0, turnosDiff: 0 };

        // 2. Mayor Salto en Turnos (mayor diff positivo o mayor % de crecimiento)
        const conCrecimiento = [...agentesActivos].filter(a => a.turnosDiff > 0).sort((a, b) => b.turnosDiff - a.turnosDiff);
        const liderSalto = conCrecimiento[0] || sortedTurnos[0] || { name: '—', turnosDiff: 0, turnosPrev: 0, turnosCurr: 0, turnosPct: 0 };

        // 3. Mayor Asistencia a Citas
        const sortedAsist = [...agentesActivos].sort((a, b) => b.asistCurr - a.asistCurr);
        const liderAsistencia = sortedAsist[0] || { name: '—', asistCurr: 0 };

        // 4. Mayor Volumen de Conversaciones
        const sortedMsjs = [...agentesActivos].sort((a, b) => b.msjsCurr - a.msjsCurr);
        const liderMensajes = sortedMsjs[0] || { name: '—', msjsCurr: 0, msjsDiff: 0 };

        // Evolución mensual global del equipo
        const sortedMonths = Object.keys(monthsData).sort();
        const now = new Date();
        const curDay = now.getDate() || 19;

        const evolucionEquipo = sortedMonths.map(pKey => {
            const mData = monthsData[pKey];
            const [pY, pM] = pKey.split('-').map(Number);
            const mName = monthNames[pM - 1];
            const isCurrEnCurso = pKey === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            const totalDaysInMonth = new Date(pY, pM, 0).getDate();

            const turnos = mData.turnosGrupales?.total || 0;
            const convs = mData.conversacionesUnicas || 0;
            const turnosProj = isCurrEnCurso ? Math.round((turnos / curDay) * totalDaysInMonth) : turnos;
            const convsProj = isCurrEnCurso ? Math.round((convs / curDay) * totalDaysInMonth) : convs;

            // Calcular promedio de asistencia de agentes
            const agentesList = mData.agentes || [];
            const sumaAsist = agentesList.reduce((acc, a) => acc + (a.asistenciaPct || 0), 0);
            const asistProm = agentesList.length > 0 ? Math.round((sumaAsist / agentesList.length) * 10) / 10 : 0;

            return {
                mes: isCurrEnCurso ? `${mName} ${pY} (Día ${curDay} de ${totalDaysInMonth})` : `${mName} ${pY}`,
                periodo: pKey,
                turnosTotales: turnos,
                turnosProyectados: turnosProj,
                convsTotales: convs,
                convsProyectadas: convsProj,
                asistenciaPromedio: asistProm,
                montoTotalLiquidado: null,
                estado: isCurrEnCurso ? 'En Curso' : 'Cerrado'
            };
        });

        return {
            success: true,
            periodoActual: periodo,
            periodoAnterior: prevPeriod,
            labelActual,
            labelAnterior,
            comparativoAgentes,
            insights: {
                liderTurnos: {
                    name: liderTurnos.name,
                    turnos: liderTurnos.turnosCurr,
                    diff: liderTurnos.turnosDiff
                },
                liderSalto: {
                    name: liderSalto.name,
                    diff: liderSalto.turnosDiff,
                    pct: liderSalto.turnosPct,
                    prev: liderSalto.turnosPrev,
                    curr: liderSalto.turnosCurr
                },
                liderAsistencia: {
                    name: liderAsistencia.name,
                    asistenciaPct: liderAsistencia.asistCurr
                },
                liderMensajes: {
                    name: liderMensajes.name,
                    mensajes: liderMensajes.msjsCurr,
                    diff: liderMensajes.msjsDiff
                }
            },
            evolucionEquipo
        };
    } catch (err) {
        console.error('Error calculando comparativo histórico:', err);
        return { success: false, comparativoAgentes: [], evolucionEquipo: [], insights: null };
    }
}

