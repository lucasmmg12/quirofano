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
 * Obtener historial de internaciones de un paciente por DNI
 */
export async function fetchHistorialInternaciones(numeroDocumento) {
    if (!numeroDocumento) return [];
    try {
        const { data, error } = await supabase
            .from('altas_administrativas')
            .select('*')
            .eq('numero_documento', numeroDocumento)
            .order('fecha_ingreso', { ascending: false });
        if (error) throw error;
        return data || [];
    } catch (err) {
        console.error('fetchHistorialInternaciones error:', err);
        return [];
    }
}

/**
 * Actualiza el estado de un alta
 */
export async function updateAltaEstado(id, estado, operador = 'operador') {
    // Si el registro tiene devolución activa, limpiar los campos de devolución
    const { data: current } = await supabase
        .from('altas_administrativas')
        .select('devolucion_id, estado_fac')
        .eq('id', id)
        .single();

    const updatePayload = { estado, operador };
    if (current?.devolucion_id && current?.estado_fac === 'Devuelta') {
        updatePayload.devolucion_id = null;
        updatePayload.estado_fac = 'Pendiente';
    }

    const { data, error } = await supabase
        .from('altas_administrativas')
        .update(updatePayload)
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
 * Obtiene altas con datos de facturación:
 *   - Traspasadas (tienen traspaso_id)
 *   - Suspendidas (estado = 'Suspendida') → viajan directo sin traspaso físico
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
            .or('traspaso_id.not.is.null,estado.eq.Suspendida,facturada.eq.true,estado_fac.eq.Facturada')
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
export async function marcarParaTraspaso(ids, usuario = 'sistema') {
    const { data, error } = await supabase
        .from('altas_administrativas')
        .update({ 
            en_carrito_traspaso: true,
            carrito_traspaso_por: usuario,
            carrito_traspaso_at: new Date().toISOString()
        })
        .in('id', ids)
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
        .update({ 
            en_carrito_traspaso: false,
            carrito_traspaso_por: null,
            carrito_traspaso_at: null
        })
        .eq('id', id)
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
        .order('fecha_ingreso', { ascending: false });

    if (error) throw error;
    return data || [];
}

/**
 * Genera un traspaso (constancia/remito)
 */
export async function generarTraspaso({ responsableEntrega, responsableRecibe, notas, selectedIds = null }) {
    // Get all cart items
    let cartItems = await fetchCarritoTraspaso();
    if (selectedIds && selectedIds.length > 0) {
        cartItems = cartItems.filter(item => selectedIds.includes(item.id));
    }
    
    if (cartItems.length === 0) throw new Error('No hay fichas seleccionadas en el carrito de traspaso');

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

// ─── Firmas Digitales (Traspasos) ───

/**
 * Guardar firma en un traspaso existente
 */
export async function firmarTraspaso(traspasoId, { firmaEntrega, firmaRecibe }) {
    const update = {};
    if (firmaEntrega !== undefined) update.firma_entrega = firmaEntrega;
    if (firmaRecibe !== undefined) update.firma_recibe = firmaRecibe;
    if (firmaEntrega || firmaRecibe) update.firmado_sistema = true;

    const { data, error } = await supabase
        .from('altas_traspasos')
        .update(update)
        .eq('id', traspasoId)
        .select()
        .single();

    if (error) throw error;
    return data;
}

// ─── Carrito de Devolución (Facturación → Control de Altas) ───

/**
 * Marcar altas para devolución (en_carrito_devolucion flag)
 */
export async function marcarParaDevolucion(ids, usuario = 'sistema') {
    const { data, error } = await supabase
        .from('altas_administrativas')
        .update({ 
            en_carrito_devolucion: true,
            carrito_devolucion_por: usuario,
            carrito_devolucion_at: new Date().toISOString()
        })
        .in('id', ids)
        .not('traspaso_id', 'is', null)
        .is('devolucion_id', null)
        .select();

    if (error) throw error;
    return data;
}

/**
 * Quitar un alta del carrito de devolución
 */
export async function quitarDeCarritoDevolucion(id) {
    const { data, error } = await supabase
        .from('altas_administrativas')
        .update({ 
            en_carrito_devolucion: false,
            carrito_devolucion_por: null,
            carrito_devolucion_at: null
        })
        .eq('id', id)
        .is('devolucion_id', null)
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * Obtiene fichas en el carrito de devolución
 */
export async function fetchCarritoDevolucion() {
    const { data, error } = await supabase
        .from('altas_administrativas')
        .select('*')
        .eq('en_carrito_devolucion', true)
        .is('devolucion_id', null)
        .order('fecha_ingreso', { ascending: false });

    if (error) throw error;
    return data || [];
}

/**
 * Genera una devolución (constancia/remito de devolución)
 */
export async function generarDevolucion({ responsableDevuelve, responsableRecibe, motivo, firmaDevuelve, firmaRecibe }) {
    // Generar código
    const year = new Date().getFullYear();
    const prefix = `DEV-${year}-`;

    const { data: lastCode } = await supabase
        .from('facturacion_devoluciones')
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
    const cartItems = await fetchCarritoDevolucion();
    if (cartItems.length === 0) throw new Error('No hay fichas en el carrito de devolución');

    const ahora = new Date().toISOString();

    // Crear registro de devolución
    const { data: devolucion, error: createErr } = await supabase
        .from('facturacion_devoluciones')
        .insert({
            codigo,
            fecha_devolucion: ahora,
            responsable_devuelve: responsableDevuelve,
            responsable_recibe: responsableRecibe || null,
            motivo: motivo || null,
            cantidad_fichas: cartItems.length,
            firma_devuelve: firmaDevuelve || null,
            firma_recibe: firmaRecibe || null,
            firmado_sistema: !!(firmaDevuelve || firmaRecibe),
        })
        .select()
        .single();

    if (createErr) throw createErr;

    // Actualizar las altas: vincular a devolución + cambiar estado
    const ids = cartItems.map(i => i.id);
    const { error: updateErr } = await supabase
        .from('altas_administrativas')
        .update({
            devolucion_id: devolucion.id,
            devuelta_at: ahora,
            devuelta_por: responsableDevuelve,
            en_carrito_devolucion: false,
            estado_fac: 'Devuelta',
        })
        .in('id', ids);

    if (updateErr) throw updateErr;

    return devolucion;
}

/**
 * Historial de devoluciones
 */
export async function fetchDevoluciones({ limit = 100 } = {}) {
    const { data, error } = await supabase
        .from('facturacion_devoluciones')
        .select('*')
        .order('fecha_devolucion', { ascending: false })
        .limit(limit);

    if (error) throw error;
    return data || [];
}

/**
 * Detalle de una devolución (fichas incluidas)
 */
export async function fetchDevolucionDetalle(devolucionId) {
    const { data, error } = await supabase
        .from('altas_administrativas')
        .select('*')
        .eq('devolucion_id', devolucionId)
        .order('fecha_ingreso', { ascending: false });

    if (error) throw error;
    return data || [];
}

/**
 * Guardar firma en una devolución existente (acuse de recibo diferido)
 */
export async function firmarDevolucion(devolucionId, { firmaDevuelve, firmaRecibe }) {
    const update = {};
    if (firmaDevuelve !== undefined) update.firma_devuelve = firmaDevuelve;
    if (firmaRecibe !== undefined) update.firma_recibe = firmaRecibe;
    if (firmaDevuelve || firmaRecibe) update.firmado_sistema = true;

    const { data, error } = await supabase
        .from('facturacion_devoluciones')
        .update(update)
        .eq('id', devolucionId)
        .select()
        .single();

    if (error) throw error;
    return data;
}

// ─── Corte Mensual de Facturación ───

/**
 * Cerrar período de facturación hasta una fecha determinada.
 * Se usa cuando una internación trasciende el mes y se necesita
 * facturar hasta el último día del mes y cerrar ese período.
 */
export async function cerrarPeriodoFacturacion(id, fechaCierre) {
    const { data, error } = await supabase
        .from('altas_administrativas')
        .update({ facturacion_cerrada_hasta: fechaCierre })
        .eq('id', id)
        .select()
        .single();
    if (error) throw error;
    return data;
}

/**
 * Reabrir el período de facturación (limpiar la marca de cierre)
 */
export async function reabrirPeriodoFacturacion(id) {
    const { data, error } = await supabase
        .from('altas_administrativas')
        .update({ facturacion_cerrada_hasta: null })
        .eq('id', id)
        .select()
        .single();
    if (error) throw error;
    return data;
}
