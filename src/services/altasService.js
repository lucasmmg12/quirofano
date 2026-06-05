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
    'Vacío':            { label: 'Vacío',            color: '#94A3B8', bg: '#F8FAFC', icon: '◽' },
};

/**
 * Obtiene altas administrativas con filtros
 * Paginación automática para superar el límite de 1000 filas de Supabase
 */
export async function fetchAltas({ fromDate, toDate, search } = {}) {
    const PAGE_SIZE = 1000;
    let allData = [];
    let from = 0;
    let hasMore = true;

    while (hasMore) {
        let query = supabase
            .from('altas_administrativas')
            .select('*')
            .order('fecha_ingreso', { ascending: false })
            .range(from, from + PAGE_SIZE - 1);

        if (fromDate) query = query.gte('fecha_ingreso', fromDate);
        if (toDate) query = query.lte('fecha_ingreso', toDate);
        if (search) {
            // Sanitizar: escapar caracteres especiales de PostgREST para que la búsqueda
            // no se rompa con comas, paréntesis, puntos, etc.
            const sanitized = search
                .replace(/\\/g, '\\\\')
                .replace(/,/g, '\\,')
                .replace(/\(/g, '\\(')
                .replace(/\)/g, '\\)')
                .replace(/%/g, '\\%');
            query = query.or(`paciente.ilike.%${sanitized}%,doctor.ilike.%${sanitized}%,cliente.ilike.%${sanitized}%,numero_admision.ilike.%${sanitized}%`);
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
 * Actualiza el responsable manual de un alta (override sobre auto-match)
 */
export async function updateAltaResponsable(id, responsable_override) {
    const { data, error } = await supabase
        .from('altas_administrativas')
        .update({ responsable_override: responsable_override || null })
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

        if (fromDate) query = query.gte('fecha_ingreso', fromDate);
        if (toDate) query = query.lte('fecha_ingreso', toDate);

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

// ─── Estados de Facturación ───
export const FACTURACION_ESTADOS = {
    'Pendiente':    { label: 'Pendiente',    color: '#94A3B8', bg: '#F8FAFC', icon: '⏳' },
    'En proceso':   { label: 'En proceso',   color: '#F59E0B', bg: '#FFFBEB', icon: '🔄' },
    'Facturada':    { label: 'Facturada',    color: '#10B981', bg: '#ECFDF5', icon: '✅' },
    'Devuelta':     { label: 'Devuelta',     color: '#EF4444', bg: '#FEF2F2', icon: '⚠️' },
};

// ─── Facturación Internada ───

/**
 * Obtiene las líneas de concepto facturadas para una admisión
 */
export async function fetchFacturacionDetalle(numeroAdmision) {
    const { data, error } = await supabase
        .from('facturacion_internada')
        .select('*')
        .eq('numero_admision', numeroAdmision)
        .order('fecha_factura', { ascending: true });

    if (error) throw error;
    return data || [];
}

/**
 * Obtiene altas con datos de facturación (solo las traspasadas)
 */
export async function fetchAltasFacturacion({ fromDate, toDate, search } = {}) {
    const PAGE_SIZE = 1000;
    let allData = [];
    let from = 0;
    let hasMore = true;

    while (hasMore) {
        let query = supabase
            .from('altas_administrativas')
            .select('*')
            .order('fecha_ingreso', { ascending: false })
            .range(from, from + PAGE_SIZE - 1);

        if (fromDate) query = query.gte('fecha_ingreso', fromDate);
        if (toDate) query = query.lte('fecha_ingreso', toDate);
        if (search) {
            const sanitized = search
                .replace(/\\/g, '\\\\')
                .replace(/,/g, '\\,')
                .replace(/\(/g, '\\(')
                .replace(/\)/g, '\\)')
                .replace(/%/g, '\\%');
            query = query.or(`paciente.ilike.%${sanitized}%,doctor.ilike.%${sanitized}%,cliente.ilike.%${sanitized}%,numero_admision.ilike.%${sanitized}%`);
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
 * Actualiza el estado de facturación
 */
export async function updateEstadoFac(id, estado_fac, operador = 'operador') {
    const { data, error } = await supabase
        .from('altas_administrativas')
        .update({ estado_fac, operador })
        .eq('id', id)
        .select()
        .single();
    if (error) throw error;
    return data;
}

/**
 * Actualiza el responsable de facturación
 */
export async function updateResponsableFac(id, responsable_fac) {
    const { data, error } = await supabase
        .from('altas_administrativas')
        .update({ responsable_fac })
        .eq('id', id)
        .select()
        .single();
    if (error) throw error;
    return data;
}

// ─── Carrito de Traspaso ───

/**
 * Marcar altas para traspaso (en_carrito_traspaso flag)
 */
export async function marcarParaTraspaso(ids) {
    const { data, error } = await supabase
        .from('altas_administrativas')
        .update({ en_carrito_traspaso: true })
        .in('id', ids)
        .is('traspaso_id', null)
        .select();

    if (error) throw error;
    return data;
}

/**
 * Quitar un alta del carrito de traspaso
 */
export async function quitarDeCarritoTraspaso(id) {
    const { data, error } = await supabase
        .from('altas_administrativas')
        .update({ en_carrito_traspaso: false })
        .eq('id', id)
        .is('traspaso_id', null)
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * Obtiene fichas en el carrito de traspaso
 */
export async function fetchCarritoTraspaso() {
    const { data, error } = await supabase
        .from('altas_administrativas')
        .select('*')
        .eq('en_carrito_traspaso', true)
        .is('traspaso_id', null)
        .order('fecha_ingreso', { ascending: false });

    if (error) throw error;
    return data || [];
}

/**
 * Genera un traspaso (constancia/remito)
 */
export async function generarTraspaso({ responsableEntrega, responsableRecibe, notas }) {
    // Get next code
    const year = new Date().getFullYear();
    const prefix = `TRSP-${year}-`;

    const { data: lastCode } = await supabase
        .from('altas_traspasos')
        .select('codigo')
        .like('codigo', `${prefix}%`)
        .order('codigo', { ascending: false })
        .limit(1);

    let nextNum = 1;
    if (lastCode && lastCode.length > 0) {
        const num = parseInt(lastCode[0].codigo.replace(prefix, ''), 10);
        if (!isNaN(num)) nextNum = num + 1;
    }
    const codigo = `${prefix}${String(nextNum).padStart(4, '0')}`;

    // Get all cart items
    const cartItems = await fetchCarritoTraspaso();
    if (cartItems.length === 0) throw new Error('No hay fichas en el carrito de traspaso');

    const ahora = new Date().toISOString();

    // Create traspaso record
    const { data: traspaso, error: createErr } = await supabase
        .from('altas_traspasos')
        .insert({
            codigo,
            fecha_traspaso: ahora,
            responsable_entrega: responsableEntrega,
            responsable_recibe: responsableRecibe || null,
            cantidad_fichas: cartItems.length,
            notas: notas || null,
        })
        .select()
        .single();

    if (createErr) throw createErr;

    // Link all items to the traspaso
    const ids = cartItems.map(i => i.id);
    const { error: updateErr } = await supabase
        .from('altas_administrativas')
        .update({
            traspaso_id: traspaso.id,
            traspasada_at: ahora,
            traspasada_por: responsableEntrega,
            en_carrito_traspaso: false,
            estado_fac: 'Pendiente',
        })
        .in('id', ids);

    if (updateErr) throw updateErr;

    return traspaso;
}

/**
 * Historial de traspasos
 */
export async function fetchTraspasos({ limit = 100 } = {}) {
    const { data, error } = await supabase
        .from('altas_traspasos')
        .select('*')
        .order('fecha_traspaso', { ascending: false })
        .limit(limit);

    if (error) throw error;
    return data || [];
}

/**
 * Detalle de un traspaso (fichas incluidas)
 */
export async function fetchTraspasoDetalle(traspasoId) {
    const { data, error } = await supabase
        .from('altas_administrativas')
        .select('*')
        .eq('traspaso_id', traspasoId)
        .order('fecha_ingreso', { ascending: false });

    if (error) throw error;
    return data || [];
}
