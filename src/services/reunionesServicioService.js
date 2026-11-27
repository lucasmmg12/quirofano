/**
 * reunionesServicioService.js
 * Servicio transversal para el Submódulo "Reuniones de Servicio" en Gobernanza de Datos.
 * Soporta TODOS los sectores (DXI, UCI, GUARDIA, QUIROFANO, EPIDEMIOLOGIA, GUARDIA_GGO, INTERNACION, COMPRAS_STOCK, CHEQUEO):
 *  - Pilar 1: Informes Ejecutivos Mensuales (RDIR 04) + Evidencias Fotográficas + Autocompletado SALUS
 *  - Pilar 2: Revisión por la Dirección
 *  - Pilar 3: Propuesta y Gestión Accionable de Objetivos Anuales (2027)
 */

import { supabase } from '../lib/supabase';

export const OBJETIVO_OFICIAL_RDIR04 =
    'Presentar a la Dirección el estado mensual del servicio para facilitar el seguimiento del Plan de Acción, el análisis de oportunidades de mejora, la evaluación de los Indicadores del Servicio y la toma de decisiones.';

export const MONTH_LABELS_ES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

export const SECTOR_METADATA = {
    DXI: {
        id: 'DXI',
        nombre: 'Diagnóstico por Imágenes',
        responsableDefault: 'Valeria Mercado',
        tutorDefault: 'Sergio Femenia',
        participantesDefault: 'Barcia Gaspar, Guillermo Sánchez y Valeria Mercado',
        plantillaIndicadores: [
            { codigo_salus: 'ECOGRAFIA', indicador: 'Ecografías', unidad: 'Cantidad', meta: 'Según presupuesto mensual' },
            { codigo_salus: 'TOMOGRAFIA', indicador: 'Tomografías', unidad: 'Cantidad', meta: 'Según presupuesto mensual' },
            { codigo_salus: 'MAMOGRAFIA', indicador: 'Mamografías', unidad: 'Cantidad', meta: 'Según presupuesto mensual' },
            { codigo_salus: 'RADIOLOGIA', indicador: 'Radiografías', unidad: 'Cantidad', meta: 'Según presupuesto mensual' },
            { codigo_salus: 'DENSITOMETRIA', indicador: 'Densitometrías', unidad: 'Cantidad', meta: 'Según presupuesto mensual' },
            { codigo_salus: 'ECOCARDIO', indicador: 'Ecocardiogramas', unidad: 'Cantidad', meta: 'Según presupuesto mensual' },
            { codigo_salus: '', indicador: 'Resultado de Encuestas de Satisfacción de Pacientes', unidad: 'Cantidad', meta: 'Mayor a 4' },
            { codigo_salus: '', indicador: 'Cumplimiento de la rutina mensual de Bitrix', unidad: '%', meta: 'Subtareas al día' },
        ]
    },
    UCI: {
        id: 'UCI',
        nombre: 'Unidad de Cuidados Intensivos (UCI)',
        responsableDefault: 'Jefatura UCI',
        tutorDefault: 'Dirección Médica',
        participantesDefault: 'Equipo Médico y Enfermería Crítica',
        plantillaIndicadores: [
            { codigo_salus: 'UCI_DIAS_PAC', indicador: 'Días-Paciente Ocupados UCI', unidad: 'Días-Cama', meta: 'Ocupación óptima 75–85%' },
            { codigo_salus: 'UCI_EGRESOS', indicador: 'Egresos / Altas del Período', unidad: 'Pacientes', meta: 'Seguimiento mensual' },
            { codigo_salus: '', indicador: 'Estancia Media en UCI', unidad: 'Días', meta: '≤ 6,5 días' },
            { codigo_salus: '', indicador: 'Cumplimiento de la rutina mensual de Bitrix', unidad: '%', meta: '≥ 85%' },
        ]
    },
    GUARDIA: {
        id: 'GUARDIA',
        nombre: 'Guardia Clínica Adultos y Pediatría',
        responsableDefault: 'Coordinación Guardia',
        tutorDefault: 'Dirección Médica',
        participantesDefault: 'Coordinación Médica y Admisiones Guardia',
        plantillaIndicadores: [
            { codigo_salus: 'GUA_ATENCIONES', indicador: 'Consultas Atendidas en Guardia', unidad: 'Cantidad', meta: 'Según demanda estacional' },
            { codigo_salus: '', indicador: 'Tiempo Promedio Puerta-Médico (Triage)', unidad: 'Minutos', meta: '≤ 25 min' },
            { codigo_salus: '', indicador: 'Conversión Guardia a Internación', unidad: '%', meta: 'Seguimiento clínico' },
            { codigo_salus: '', indicador: 'Cumplimiento de la rutina mensual de Bitrix', unidad: '%', meta: '≥ 85%' },
        ]
    },
    QUIROFANO: {
        id: 'QUIROFANO',
        nombre: 'Quirófano Central y Hospital de Día',
        responsableDefault: 'Jefatura Quirófano',
        tutorDefault: 'Dirección Médica',
        participantesDefault: 'Coordinación Quirúrgica, Instrumentación y Anestesia',
        plantillaIndicadores: [
            { codigo_salus: 'QX_CIRUGIAS', indicador: 'Cirugías Efectivamente Realizadas', unidad: 'Cantidad', meta: 'Según presupuesto quirúrgico' },
            { codigo_salus: '', indicador: 'Tasa de Suspensiones Quirúrgicas', unidad: '%', meta: '< 5%' },
            { codigo_salus: '', indicador: 'Ocupación de Bloques Quirúrgicos', unidad: '%', meta: '≥ 80%' },
            { codigo_salus: '', indicador: 'Cumplimiento de la rutina mensual de Bitrix', unidad: '%', meta: '≥ 85%' },
        ]
    },
    EPIDEMIOLOGIA: {
        id: 'EPIDEMIOLOGIA',
        nombre: 'Epidemiología y Control de Infecciones',
        responsableDefault: 'Dr. Francisco Romano',
        tutorDefault: 'Dirección Médica',
        participantesDefault: 'Comité de Control de Infecciones',
        plantillaIndicadores: [
            { codigo_salus: '', indicador: 'Notificaciones Epidemiológicas (Planilla C2)', unidad: 'Casos', meta: '100% notificadas en término' },
            { codigo_salus: '', indicador: 'Adherencia a Higiene de Manos', unidad: '%', meta: '≥ 85%' },
            { codigo_salus: '', indicador: 'Cumplimiento de la rutina mensual de Bitrix', unidad: '%', meta: '≥ 85%' },
        ]
    },
    GUARDIA_GGO: {
        id: 'GUARDIA_GGO',
        nombre: 'Guardia Gineco-Obstétrica (GGO)',
        responsableDefault: 'Jefatura Tocoginecología',
        tutorDefault: 'Dirección Médica',
        participantesDefault: 'Equipo GGO',
        plantillaIndicadores: [
            { codigo_salus: '', indicador: 'Atenciones de Guardia Gineco-Obstétrica', unidad: 'Cantidad', meta: 'Seguimiento mensual' },
            { codigo_salus: '', indicador: 'Ecografías Tocoginecológicas de Urgencia', unidad: 'Cantidad', meta: 'Seguimiento mensual' },
            { codigo_salus: '', indicador: 'Cumplimiento de la rutina mensual de Bitrix', unidad: '%', meta: '≥ 85%' },
        ]
    },
    INTERNACION: {
        id: 'INTERNACION',
        nombre: 'Internación General, Pediatría y Neonatología',
        responsableDefault: 'Coordinación de Internación',
        tutorDefault: 'Dirección Médica',
        participantesDefault: 'Jefaturas de Piso, Enfermería y Admisión',
        plantillaIndicadores: [
            { codigo_salus: 'INT_EGRESOS', indicador: 'Egresos Hospitalarios Totales', unidad: 'Pacientes', meta: 'Según capacidad instalada' },
            { codigo_salus: '', indicador: 'Giro Cama Institucional', unidad: 'Índice', meta: '≥ 5,0' },
            { codigo_salus: '', indicador: 'Cumplimiento Epicrisis al Alta', unidad: '%', meta: '≥ 95%' },
        ]
    },
    COMPRAS_STOCK: {
        id: 'COMPRAS_STOCK',
        nombre: 'Compras, Farmacia y Gestión de Stock',
        responsableDefault: 'Jefatura de Compras y Farmacia',
        tutorDefault: 'Dirección Administrativa',
        participantesDefault: 'Compras, Depósito Central y Farmacia',
        plantillaIndicadores: [
            { codigo_salus: '', indicador: 'Cumplimiento de Entregas de Proveedores Críticos', unidad: '%', meta: '≥ 92%' },
            { codigo_salus: '', indicador: 'Quiebres de Stock de Insumos Críticos', unidad: 'Eventos', meta: '0 quiebres críticos' },
            { codigo_salus: '', indicador: 'Rotación de Inventario Hospitalario', unidad: 'Días', meta: '≤ 35 días' },
        ]
    },
    CHEQUEO: {
        id: 'CHEQUEO',
        nombre: 'Chequeo Preventivo y Medicina Preventiva',
        responsableDefault: 'Coordinación Chequeo Preventivo',
        tutorDefault: 'Dirección / Comercial',
        participantesDefault: 'Recepción Chequeos, Coordinación Médica y Calidad',
        plantillaIndicadores: [
            { codigo_salus: 'CHQ_PRESENTES', indicador: 'Chequeos Preventivos Realizados', unidad: 'Pacientes', meta: '525 mensuales' },
            { codigo_salus: 'CHQ_INFORMES', indicador: 'Consultas de Devolución de Informe', unidad: 'Pacientes', meta: '≥ 45% de retorno' },
            { codigo_salus: 'CHQ_ASISTENCIA', indicador: 'Tasa de Asistencia Efectiva (%)', unidad: '%', meta: '≥ 80%' },
            { codigo_salus: 'CHQ_NPS', indicador: 'NPS Calidad Post-Chequeo', unidad: 'Puntos', meta: '≥ 75' },
        ]
    }
};

export function getSectorMeta(sectorId) {
    const key = String(sectorId || 'DXI').toUpperCase();
    return SECTOR_METADATA[key] || {
        id: key,
        nombre: key,
        responsableDefault: '',
        tutorDefault: 'Dirección',
        participantesDefault: '',
        plantillaIndicadores: [
            { codigo_salus: '', indicador: 'Producción Principal del Servicio', unidad: 'Cantidad', meta: 'Según presupuesto mensual' },
            { codigo_salus: '', indicador: 'Resultado de Encuestas de Satisfacción', unidad: 'Puntos', meta: 'Mayor a 4' },
            { codigo_salus: '', indicador: 'Cumplimiento de la rutina mensual de Bitrix', unidad: '%', meta: '≥ 85%' },
        ]
    };
}

export function formatPeriodoLabel(periodo) {
    if (!periodo || !/^\d{4}-\d{2}$/.test(periodo)) return periodo || '';
    const [y, m] = periodo.split('-').map(Number);
    return `${MONTH_LABELS_ES[m - 1] || m} ${y}`;
}

export function getPreviousPeriodo(periodo) {
    if (!periodo || !/^\d{4}-\d{2}$/.test(periodo)) return '';
    let [y, m] = periodo.split('-').map(Number);
    m -= 1;
    if (m < 1) { m = 12; y -= 1; }
    return `${y}-${String(m).padStart(2, '0')}`;
}

export function calcVariacionYTendencia(anterior, actual) {
    const prev = anterior === '' || anterior === null || anterior === undefined ? NaN : Number(anterior);
    const curr = actual === '' || actual === null || actual === undefined ? NaN : Number(actual);
    if (!Number.isFinite(prev) || !Number.isFinite(curr) || prev === 0) {
        return { variacion: null, tendencia: Number.isFinite(curr) ? 'Estable' : 'Sin dato' };
    }
    const v = (curr - prev) / prev;
    let tendencia = 'Estable';
    if (v > 0.01) tendencia = 'Mejora';
    else if (v < -0.01) tendencia = 'Deterioro';
    return { variacion: Math.round(v * 10000) / 10000, tendencia };
}

// ============================================================================
// 1. LECTURA INTEGRAL POR SECTOR
// ============================================================================
export async function fetchReunionesSectorBundle(sectorId) {
    const sKey = String(sectorId || 'DXI').toUpperCase();
    const [infRes, revRes, objRes] = await Promise.all([
        supabase
            .from('gob_reuniones_informes')
            .select('*')
            .eq('sector_id', sKey)
            .order('periodo', { ascending: true }),
        supabase
            .from('gob_reuniones_revision')
            .select('*')
            .eq('sector_id', sKey)
            .order('created_at', { ascending: false }),
        supabase
            .from('gob_reuniones_objetivos')
            .select('*')
            .eq('sector_id', sKey)
            .order('anio_ejercicio', { ascending: false })
            .order('orden', { ascending: true }),
    ]);

    if (infRes.error) throw infRes.error;
    if (revRes.error) throw revRes.error;
    if (objRes.error) throw objRes.error;

    return {
        informes: infRes.data || [],
        revisiones: revRes.data || [],
        objetivos: objRes.data || [],
    };
}

// ============================================================================
// 2. PLANTILLA NUEVO INFORME MENSUAL (CON CLONACIÓN DEL MES ANTERIOR)
// ============================================================================
export function createBlankOrClonedInforme(sectorId, targetPeriodo, previousInforme = null) {
    const meta = getSectorMeta(sectorId);
    if (previousInforme) {
        return {
            sector_id: meta.id,
            servicio_nombre: previousInforme.servicio_nombre || meta.nombre,
            periodo: targetPeriodo,
            codigo_registro: 'RDIR 04',
            objetivo_informe: OBJETIVO_OFICIAL_RDIR04,
            responsable: previousInforme.responsable || meta.responsableDefault,
            tutor: previousInforme.tutor || meta.tutorDefault,
            fecha_reunion: 'Pendiente de confirmar',
            participantes: previousInforme.participantes || meta.participantesDefault,
            estado_general: previousInforme.estado_general || 'Favorable, con oportunidades de mejora',
            resumen_ejecutivo: '',
            compromisos_acordados: [],
            compromisos_sugeridos: [],
            plan_accion: (previousInforme.plan_accion || []).map(pa => ({ ...pa })),
            oportunidades_mejora: (previousInforme.oportunidades_mejora || []).map(om => ({ ...om })),
            indicadores: (previousInforme.indicadores || []).map(ind => ({
                ...ind,
                resultado_anterior: ind.resultado_actual ?? ind.resultado_anterior ?? null,
                resultado_actual: null,
                variacion: null,
                tendencia: 'Sin dato',
                comentario: '',
            })),
            necesidades_direccion: (previousInforme.necesidades_direccion || []).map(n => ({ ...n })),
            hallazgos_notas: [],
            fotos: [],
            insights_clave: [],
        };
    }

    return {
        sector_id: meta.id,
        servicio_nombre: meta.nombre,
        periodo: targetPeriodo,
        codigo_registro: 'RDIR 04',
        objetivo_informe: OBJETIVO_OFICIAL_RDIR04,
        responsable: meta.responsableDefault,
        tutor: meta.tutorDefault,
        fecha_reunion: 'Pendiente de confirmar',
        participantes: meta.participantesDefault,
        estado_general: 'Favorable, con oportunidades de mejora',
        resumen_ejecutivo: '',
        compromisos_acordados: [],
        compromisos_sugeridos: [],
        plan_accion: [
            { codigo: 'PA-01', accion: '', vinculo_bitrix: '', responsable: meta.responsableDefault, fecha_objetivo: '', estado: 'En curso', avance_mes: '', dificultad: '' }
        ],
        oportunidades_mejora: [
            { codigo: 'OM-01', oportunidad: '', origen: '', accion_propuesta: '', responsable: meta.responsableDefault, estado: 'En curso' }
        ],
        indicadores: meta.plantillaIndicadores.map(ind => ({
            ...ind,
            resultado_anterior: null,
            resultado_actual: null,
            variacion: null,
            tendencia: 'Sin dato',
            comentario: '',
        })),
        necesidades_direccion: [],
        hallazgos_notas: [],
        fotos: [],
        insights_clave: [],
    };
}

// ============================================================================
// 3. GUARDAR / ELIMINAR INFORMES, REVISIÓN Y OBJETIVOS
// ============================================================================
export async function upsertInformeMensual(informe) {
    const payload = {
        ...informe,
        sector_id: String(informe.sector_id || 'DXI').toUpperCase(),
        updated_at: new Date().toISOString(),
    };
    delete payload.created_at;
    const { data, error } = await supabase
        .from('gob_reuniones_informes')
        .upsert(payload, { onConflict: 'sector_id,periodo' })
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function deleteInformeMensual(id) {
    const { error } = await supabase.from('gob_reuniones_informes').delete().eq('id', id);
    if (error) throw error;
}

export async function upsertRevisionDireccion(revision) {
    const payload = {
        ...revision,
        sector_id: String(revision.sector_id || 'DXI').toUpperCase(),
        updated_at: new Date().toISOString(),
    };
    delete payload.created_at;
    const { data, error } = await supabase
        .from('gob_reuniones_revision')
        .upsert(payload, { onConflict: 'sector_id,periodo_evaluado' })
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function upsertObjetivoSector(objetivo) {
    const acciones = Array.isArray(objetivo.acciones_principales) ? objetivo.acciones_principales : [];
    const autoPct = acciones.length > 0
        ? Math.round((acciones.filter(a => a.completada).length / acciones.length) * 100)
        : (Number(objetivo.progreso_pct) || 0);

    const payload = {
        ...objetivo,
        sector_id: String(objetivo.sector_id || 'DXI').toUpperCase(),
        progreso_pct: autoPct,
        updated_at: new Date().toISOString(),
    };
    delete payload.created_at;

    const query = payload.id
        ? supabase.from('gob_reuniones_objetivos').upsert(payload).select().single()
        : supabase.from('gob_reuniones_objetivos').upsert(payload, { onConflict: 'sector_id,anio_ejercicio,orden' }).select().single();

    const { data, error } = await query;
    if (error) throw error;
    return data;
}

export async function deleteObjetivoSector(id) {
    const { error } = await supabase.from('gob_reuniones_objetivos').delete().eq('id', id);
    if (error) throw error;
}

// ============================================================================
// 4. AUTOCOMPLETADO INTELIGENTE DE INDICADORES DESDE SALUS / MAYORES
// ============================================================================
const ESTADOS_EFECTIVOS_DXI = new Set(['Presente', 'Internado', 'Urgencia', 'Sobreturno']);

export async function autocompletarIndicadoresDesdeSalus(sectorId, periodo, currentIndicadores = []) {
    const sKey = String(sectorId || 'DXI').toUpperCase();
    const prevPeriodo = getPreviousPeriodo(periodo);
    const mesNombre = formatPeriodoLabel(periodo);

    // ── A. DIAGNÓSTICO POR IMÁGENES (lee dxi_analytics_cache oficial de SALUS en app_config) ──
    if (sKey === 'DXI') {
        const { data: cfg, error } = await supabase
            .from('app_config')
            .select('value')
            .eq('key', 'dxi_analytics_cache')
            .maybeSingle();
        if (error) throw error;
        const parsed = typeof cfg?.value === 'string' ? JSON.parse(cfg.value) : cfg?.value;
        const agendas = Array.isArray(parsed?.agendas) ? parsed.agendas : [];

        const sumByModAndMonth = (mod, targetMes) => {
            return agendas
                .filter(r =>
                    r.PeriodoMes === targetMes &&
                    r.Modalidad === mod &&
                    (!r.EstadoAsistencia || ESTADOS_EFECTIVOS_DXI.has(r.EstadoAsistencia))
                )
                .reduce((acc, r) => acc + (Number(r.Cantidad) || 0), 0);
        };

        const MOD_KEYS = ['ECOGRAFIA', 'TOMOGRAFIA', 'MAMOGRAFIA', 'RADIOLOGIA', 'DENSITOMETRIA', 'ECOCARDIO'];
        const NAME_TO_MOD = {
            ecografia: 'ECOGRAFIA',
            tomografia: 'TOMOGRAFIA',
            mamografia: 'MAMOGRAFIA',
            radiografia: 'RADIOLOGIA',
            densitometria: 'DENSITOMETRIA',
            ecocardiograma: 'ECOCARDIO',
        };

        let updatedCount = 0;
        const baseList = currentIndicadores.length > 0
            ? currentIndicadores
            : getSectorMeta('DXI').plantillaIndicadores.map(x => ({ ...x }));

        const nextIndicadores = baseList.map(ind => {
            let modKey = ind.codigo_salus;
            if (!modKey) {
                const normName = String(ind.indicador || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                for (const [k, v] of Object.entries(NAME_TO_MOD)) {
                    if (normName.includes(k)) { modKey = v; break; }
                }
            }
            if (!modKey || !MOD_KEYS.includes(modKey)) return ind;

            const actualSalus = sumByModAndMonth(modKey, periodo);
            const prevSalus = sumByModAndMonth(modKey, prevPeriodo);
            if (actualSalus === 0 && prevSalus === 0) return ind;

            updatedCount++;
            const antVal = prevSalus > 0 ? prevSalus : ind.resultado_anterior;
            const actVal = actualSalus > 0 ? actualSalus : ind.resultado_actual;
            const { variacion, tendencia } = calcVariacionYTendencia(antVal, actVal);

            return {
                ...ind,
                codigo_salus: modKey,
                resultado_anterior: antVal,
                resultado_actual: actVal,
                variacion,
                tendencia,
                comentario: ind.comentario || `${mesNombre}: dato extraído automáticamente desde SALUS (${actVal?.toLocaleString('es-AR') || 0} estudios efectivos).`,
            };
        });

        return { indicadores: nextIndicadores, updatedCount, fuente: 'SALUS · Caché Analítica DxI' };
    }

    // ── B. CHEQUEO PREVENTIVO (lee gob_chequeo_mensual + gob_chequeo_resumen) ──
    if (sKey === 'CHEQUEO') {
        const { data: rows } = await supabase
            .from('gob_chequeo_mensual')
            .select('*')
            .eq('sede', 'TODAS')
            .in('periodo', [prevPeriodo, periodo]);
        const cur = (rows || []).find(r => r.periodo === periodo);
        const prv = (rows || []).find(r => r.periodo === prevPeriodo);
        if (!cur && !prv) return { indicadores: currentIndicadores, updatedCount: 0, fuente: 'Mayores Chequeo' };

        let updatedCount = 0;
        const baseList = currentIndicadores.length > 0
            ? currentIndicadores
            : getSectorMeta('CHEQUEO').plantillaIndicadores.map(x => ({ ...x }));

        const nextIndicadores = baseList.map(ind => {
            let ant = ind.resultado_anterior;
            let act = ind.resultado_actual;
            if (ind.codigo_salus === 'CHQ_PRESENTES') { ant = prv?.chq_presentes ?? ant; act = cur?.chq_presentes ?? act; updatedCount++; }
            else if (ind.codigo_salus === 'CHQ_INFORMES') { ant = prv?.inf_presentes ?? ant; act = cur?.inf_presentes ?? act; updatedCount++; }
            else if (ind.codigo_salus === 'CHQ_ASISTENCIA') { ant = prv?.tasa_asistencia_pct ?? ant; act = cur?.tasa_asistencia_pct ?? act; updatedCount++; }
            else return ind;

            const { variacion, tendencia } = calcVariacionYTendencia(ant, act);
            return { ...ind, resultado_anterior: ant, resultado_actual: act, variacion, tendencia };
        });
        return { indicadores: nextIndicadores, updatedCount, fuente: 'SALUS · Mayores Chequeo Preventivo' };
    }

    // ── C. UCI / INTERNACIÓN (lee calidad_ocupacion_diaria) ──
    if (sKey === 'UCI' || sKey === 'INTERNACION') {
        const [y, m] = periodo.split('-').map(Number);
        const lastDay = new Date(y, m, 0).getDate();
        const [py, pm] = prevPeriodo.split('-').map(Number);
        const prevLastDay = new Date(py, pm, 0).getDate();

        const { data: occ } = await supabase
            .from('calidad_ocupacion_diaria')
            .select('fecha_ocupacion, id_paciente, fecha_alta')
            .gte('fecha_ocupacion', `${prevPeriodo}-01`)
            .lte('fecha_ocupacion', `${periodo}-${String(lastDay).padStart(2, '0')}`)
            .limit(5000);

        const curRows = (occ || []).filter(r => (r.fecha_ocupacion || '').startsWith(periodo));
        const prvRows = (occ || []).filter(r => (r.fecha_ocupacion || '').startsWith(prevPeriodo));
        if (!curRows.length && !prvRows.length) {
            return { indicadores: currentIndicadores, updatedCount: 0, fuente: 'SALUS Censo' };
        }
        const baseList = currentIndicadores.length > 0
            ? currentIndicadores
            : getSectorMeta(sKey).plantillaIndicadores.map(x => ({ ...x }));
        let updatedCount = 0;
        const nextIndicadores = baseList.map((ind, idx) => {
            if (idx === 0) {
                updatedCount++;
                const ant = prvRows.length || ind.resultado_anterior;
                const act = curRows.length || ind.resultado_actual;
                const { variacion, tendencia } = calcVariacionYTendencia(ant, act);
                return { ...ind, resultado_anterior: ant, resultado_actual: act, variacion, tendencia, comentario: `${mesNombre}: ${act} días-cama auditados en SALUS (sobre ${prevLastDay}/${lastDay} días).` };
            }
            return ind;
        });
        return { indicadores: nextIndicadores, updatedCount, fuente: 'SALUS · Censo de Ocupación' };
    }

    return { indicadores: currentIndicadores, updatedCount: 0, fuente: 'Manual / SALUS' };
}

// ============================================================================
// 5. COMPRESIÓN Y SUBIDA DE FOTOS DE INFORMES MENSUALES
// ============================================================================
async function compressImageFile(file, maxDim = 1400, quality = 0.82) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload = () => {
            const img = new Image();
            img.onerror = reject;
            img.onload = () => {
                let { width, height } = img;
                if (width > maxDim || height > maxDim) {
                    const ratio = Math.min(maxDim / width, maxDim / height);
                    width = Math.round(width * ratio);
                    height = Math.round(height * ratio);
                }
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                const dataUrl = canvas.toDataURL('image/jpeg', quality);
                canvas.toBlob(
                    blob => resolve({ blob, dataUrl, width, height }),
                    'image/jpeg',
                    quality
                );
            };
            img.src = reader.result;
        };
        reader.readAsDataURL(file);
    });
}

export async function uploadFotoInforme(file, sectorId, periodo) {
    const { blob, dataUrl } = await compressImageFile(file);
    const safeSector = String(sectorId || 'DXI').toLowerCase();
    const fileName = `reuniones/${safeSector}/${periodo}/${Date.now()}_${Math.random().toString(36).slice(2, 7)}.jpg`;

    try {
        const { error: upErr } = await supabase.storage
            .from('gobernanza_documentos')
            .upload(fileName, blob, { contentType: 'image/jpeg', upsert: true });

        if (!upErr) {
            const { data: pub } = supabase.storage.from('gobernanza_documentos').getPublicUrl(fileName);
            if (pub?.publicUrl) {
                return {
                    id: `foto_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                    url: pub.publicUrl,
                    dataUrl, // cache inmediato para embebido en Excel/PPTX
                    storagePath: fileName,
                    titulo: file.name.replace(/\.[^.]+$/, ''),
                    descripcion: '',
                    fecha: new Date().toISOString().slice(0, 10),
                };
            }
        }
    } catch (e) {
        console.warn('[ReunionesServicio] Fallback a dataUrl local para foto:', e);
    }

    return {
        id: `foto_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        url: dataUrl,
        dataUrl,
        storagePath: null,
        titulo: file.name.replace(/\.[^.]+$/, ''),
        descripcion: '',
        fecha: new Date().toISOString().slice(0, 10),
    };
}
