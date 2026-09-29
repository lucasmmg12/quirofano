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
            nombre: 'Mensajes / Conversaciones Gestionadas',
            alcance: 'Grupal',
            ponderacion: 0.50,
            maxMonto: 69735.29,
            base: 6500,
            meta: 7500,
            tope: 8500,
            paso: 200,
            montoPaso: 6973.53,
            unidad: 'mensajes'
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
 * Obtiene las métricas en vivo de SALUS vía sync-server
 */
export async function fetchMetricasIncentivosSalus(periodo) {
    const base = getSalusSyncBaseUrl();
    const url = `${base}/api/salus/incentivos-contact-center?periodo=${encodeURIComponent(periodo)}`;
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`Error en servidor de sincronización SALUS (${res.status})`);
    }
    const json = await res.json();
    if (!json.success) {
        throw new Error(json.error || 'No se pudieron recuperar las métricas de SALUS');
    }
    return json;
}

/**
 * Consulta la cantidad de mensajes del Contact Center en Supabase para el mes
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

        const base = BASE_GARANTIZADA_HISTORICA * fte;
        const montoMensajes = escalonMensajes.monto * fte;
        const montoTurnos = escalonTurnos.monto * fte;
        const montoAsistencia = (ag.montoAsistencia || 0) * fte;

        const totalVariable = montoMensajes + montoTurnos + montoAsistencia;
        const totalALiquidar = base + totalVariable;

        return {
            ...ag,
            fte,
            baseGarantizadaLiquidada: Math.round(base * 100) / 100,
            montoMensajes: Math.round(montoMensajes * 100) / 100,
            montoTurnos: Math.round(montoTurnos * 100) / 100,
            montoAsistencia: Math.round(montoAsistencia * 100) / 100,
            totalVariable: Math.round(totalVariable * 100) / 100,
            totalALiquidar: Math.round(totalALiquidar * 100) / 100
        };
    });

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
