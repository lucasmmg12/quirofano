/**
 * altasService.js — Servicio para Altas Administrativas
 * CRUD + estadísticas para el control de altas desde SALUS
 */

import { supabase } from '../lib/supabase';

/**
 * Estados posibles del control de altas administrativas
 */
export const ALTA_ESTADOS = {
    'Procesada':        { label: 'Procesada',        color: '#8B5CF6', bg: '#F5F3FF', icon: '📄' },
    'En auditoria':     { label: 'En auditoría',     color: '#F59E0B', bg: '#FFFBEB', icon: '🔍' },
    'Prórroga':         { label: 'Prórroga',         color: '#F97316', bg: '#FFF7ED', icon: '⏳' },
    'Con presupuesto':  { label: 'Con presupuesto',  color: '#EC4899', bg: '#FDF2F8', icon: '💰' },
    'Alta Adm':         { label: 'Alta Adm',         color: '#10B981', bg: '#ECFDF5', icon: '✅' },
    'Suspendida':       { label: 'Suspendida',       color: '#EF4444', bg: '#FEF2F2', icon: '⛔' },
    'Particular':       { label: 'Particular',       color: '#6B7280', bg: '#F3F4F6', icon: '👤' },
    'Interconsulta':    { label: 'Interconsulta',    color: '#3B82F6', bg: '#EFF6FF', icon: '🔄' },
};

/**
 * Obtiene altas administrativas con filtros
 * Paginación automática para superar el límite de 1000 filas de Supabase
 */
export async function fetchAltas({ fromDate, toDate, estado, search } = {}) {
    const PAGE_SIZE = 1000;
    let allData = [];
    let from = 0;
    let hasMore = true;

    while (hasMore) {
        let query = supabase
            .from('altas_administrativas')
            .select('*')
            .order('fecha_alta', { ascending: false })
            .range(from, from + PAGE_SIZE - 1);

        if (fromDate) query = query.gte('fecha_alta', fromDate);
        if (toDate) query = query.lte('fecha_alta', toDate);
        if (estado && estado !== 'all') query = query.eq('estado', estado);
        if (search) {
            query = query.or(`paciente.ilike.%${search}%,doctor.ilike.%${search}%,cliente.ilike.%${search}%,numero_admision.ilike.%${search}%`);
        }

        const { data, error } = await query;
        if (error) throw error;

        const rows = data || [];
        allData = allData.concat(rows);
        hasMore = rows.length === PAGE_SIZE;
        from += PAGE_SIZE;
    }

    return allData;
}

/**
 * Actualiza el estado de un alta
 */
export async function updateAltaEstado(id, estado, operador = 'operador') {
    const { data, error } = await supabase
        .from('altas_administrativas')
        .update({ estado, operador })
        .eq('id', id)
        .select()
        .single();
    if (error) throw error;
    return data;
}

/**
 * Actualiza notas internas de un alta
 */
export async function updateAltaNotas(id, notas_internas) {
    const { data, error } = await supabase
        .from('altas_administrativas')
        .update({ notas_internas })
        .eq('id', id)
        .select()
        .single();
    if (error) throw error;
    return data;
}

/**
 * Obtiene estadísticas de altas por estado (paginado)
 */
export async function getAltasStats(fromDate, toDate) {
    const PAGE_SIZE = 1000;
    let allData = [];
    let from = 0;
    let hasMore = true;

    while (hasMore) {
        let query = supabase
            .from('altas_administrativas')
            .select('estado')
            .range(from, from + PAGE_SIZE - 1);

        if (fromDate) query = query.gte('fecha_alta', fromDate);
        if (toDate) query = query.lte('fecha_alta', toDate);

        const { data, error } = await query;
        if (error) throw error;

        const rows = data || [];
        allData = allData.concat(rows);
        hasMore = rows.length === PAGE_SIZE;
        from += PAGE_SIZE;
    }

    const stats = {};
    for (const key of Object.keys(ALTA_ESTADOS)) {
        stats[key] = 0;
    }
    allData.forEach(row => {
        if (stats[row.estado] !== undefined) stats[row.estado]++;
        else stats[row.estado] = 1;
    });
    stats._total = allData.length;
    return stats;
}
