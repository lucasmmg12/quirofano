/**
 * asociacionesService.js — Servicio CRUD para Entrega de Asociaciones
 * 
 * Gestiona cirugías sincronizadas, carrito de entrega y constancias.
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// ─── Mapeo Especialidad → Asociación ───
export const ASOCIACION_MAP = {
    'CIRUGIA': 'Asociación de Cirujanos',
    'GINECOLOGIA': 'Asociación de Ginecólogos',
    'ORTOPEDIA / TRAUMATOLOGIA': 'Asociación de Traumatólogos',
    'CIRUGIA PEDIATRICA': 'Asociación de Cirujanos Pediatras',
    'OTORRINOLARINGOLOGIA': 'ORL (Particular)',
};

export const ASOCIACION_COLORS = {
    'Asociación de Cirujanos': '#6366F1',
    'Asociación de Ginecólogos': '#EC4899',
    'Asociación de Traumatólogos': '#F59E0B',
    'Asociación de Cirujanos Pediatras': '#10B981',
    'ORL (Particular)': '#8B5CF6',
};

export const ASOCIACION_LIST = Object.values(ASOCIACION_MAP);

// ─── Cirugías ───

/**
 * Fetches all synced surgeries, optionally filtered.
 */
export async function fetchAsociacionesCirugias({ asociacion, fechaDesde, fechaHasta, search, soloSinConstancia = true, soloSinCarrito = false } = {}) {
    let query = supabase
        .from('asociaciones_cirugias')
        .select('*')
        .order('fecha_realizacion', { ascending: false })
        .limit(10000);

    if (soloSinConstancia) {
        query = query.is('constancia_id', null);
    }
    if (soloSinCarrito) {
        query = query.eq('en_carrito', false);
    }
    if (asociacion) {
        query = query.eq('asociacion', asociacion);
    }
    if (fechaDesde) {
        query = query.gte('fecha_realizacion', fechaDesde);
    }
    if (fechaHasta) {
        query = query.lte('fecha_realizacion', fechaHasta);
    }
    if (search) {
        query = query.or(`nombre_paciente.ilike.%${search}%,dni.ilike.%${search}%,cirujano.ilike.%${search}%`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
}

/**
 * Toggle the docs_completos flag for a surgery.
 */
export async function toggleDocsCompletos(id, operador) {
    // First get current state
    const { data: current, error: fetchErr } = await supabase
        .from('asociaciones_cirugias')
        .select('docs_completos')
        .eq('id', id)
        .single();

    if (fetchErr) throw fetchErr;

    const newVal = !current.docs_completos;
    const updateData = {
        docs_completos: newVal,
        operador: newVal ? operador : null,
        checked_at: newVal ? new Date().toISOString() : null,
        // If unchecking docs, also remove from carrito
        ...(newVal ? {} : { en_carrito: false }),
    };

    const { data, error } = await supabase
        .from('asociaciones_cirugias')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * Move checked surgeries to the delivery cart.
 */
export async function enviarAlCarrito(ids) {
    const { data, error } = await supabase
        .from('asociaciones_cirugias')
        .update({ en_carrito: true })
        .in('id', ids)
        .eq('docs_completos', true) // Safety: only checked items
        .is('constancia_id', null)  // Safety: not already delivered
        .select();

    if (error) throw error;
    return data;
}

/**
 * Remove surgery from the cart (back to pending).
 */
export async function quitarDelCarrito(id) {
    const { data, error } = await supabase
        .from('asociaciones_cirugias')
        .update({ en_carrito: false })
        .eq('id', id)
        .is('constancia_id', null)
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * Get all items currently in the cart, grouped by asociacion.
 */
export async function fetchCarrito() {
    const { data, error } = await supabase
        .from('asociaciones_cirugias')
        .select('*')
        .eq('en_carrito', true)
        .is('constancia_id', null)
        .order('asociacion')
        .order('fecha_realizacion', { ascending: true })
        .limit(10000);

    if (error) throw error;

    // Group by asociacion
    const grouped = {};
    for (const item of (data || [])) {
        if (!grouped[item.asociacion]) grouped[item.asociacion] = [];
        grouped[item.asociacion].push(item);
    }
    return grouped;
}

// ─── Constancias ───

/**
 * Generate the next sequential constancia code: ENT-YYYY-NNNN
 */
async function getNextCodigoConstancia() {
    const year = new Date().getFullYear();
    const prefix = `ENT-${year}-`;

    const { data } = await supabase
        .from('asociaciones_constancias')
        .select('codigo')
        .like('codigo', `${prefix}%`)
        .order('codigo', { ascending: false })
        .limit(1);

    let nextNum = 1;
    if (data && data.length > 0) {
        const lastCode = data[0].codigo;
        const lastNum = parseInt(lastCode.replace(prefix, ''), 10);
        if (!isNaN(lastNum)) nextNum = lastNum + 1;
    }

    return `${prefix}${String(nextNum).padStart(4, '0')}`;
}

/**
 * Generate a delivery constancia, link all cart items for the association.
 */
export async function generarConstancia({ asociacion, responsable, nombreCadete, notas }) {
    const codigo = await getNextCodigoConstancia();

    // 1. Get all cart items for this association
    const { data: items, error: fetchErr } = await supabase
        .from('asociaciones_cirugias')
        .select('id')
        .eq('asociacion', asociacion)
        .eq('en_carrito', true)
        .is('constancia_id', null);

    if (fetchErr) throw fetchErr;
    if (!items || items.length === 0) throw new Error('No hay expedientes en el carrito para esta asociación');

    const ahora = new Date().toISOString();

    // 2. Create constancia
    const { data: constancia, error: createErr } = await supabase
        .from('asociaciones_constancias')
        .insert({
            codigo,
            asociacion,
            fecha_entrega: ahora,
            responsable_entrega: responsable,
            nombre_cadete: nombreCadete || null,
            cantidad_expedientes: items.length,
            notas: notas || null,
        })
        .select()
        .single();

    if (createErr) throw createErr;

    // 3. Link all items to the constancia
    const ids = items.map(i => i.id);
    const { error: updateErr } = await supabase
        .from('asociaciones_cirugias')
        .update({
            constancia_id: constancia.id,
            entregado_at: ahora,
            en_carrito: false,
        })
        .in('id', ids);

    if (updateErr) throw updateErr;

    return constancia;
}

/**
 * Fetch delivery history (constancias).
 */
export async function fetchConstancias({ asociacion, limit = 1000 } = {}) {
    let query = supabase
        .from('asociaciones_constancias')
        .select('*')
        .order('fecha_entrega', { ascending: false })
        .limit(limit);

    if (asociacion) {
        query = query.eq('asociacion', asociacion);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
}

/**
 * Fetch all surgeries linked to a specific constancia.
 */
export async function fetchConstanciaDetalle(constanciaId) {
    const { data, error } = await supabase
        .from('asociaciones_cirugias')
        .select('*')
        .eq('constancia_id', constanciaId)
        .order('fecha_realizacion', { ascending: true });

    if (error) throw error;
    return data || [];
}

/**
 * Fetch constancia + its items together (for printing).
 */
export async function fetchConstanciaParaImpresion(constanciaId) {
    const [constancia, items] = await Promise.all([
        supabase.from('asociaciones_constancias').select('*').eq('id', constanciaId).single(),
        fetchConstanciaDetalle(constanciaId),
    ]);

    if (constancia.error) throw constancia.error;
    return { constancia: constancia.data, items };
}

/**
 * Get summary counts per association (for dashboard badges).
 */
export async function fetchResumenAsociaciones() {
    const { data, error } = await supabase
        .from('asociaciones_cirugias')
        .select('asociacion, docs_completos, en_carrito, constancia_id')
        .limit(10000);

    if (error) throw error;

    const resumen = {};
    for (const asoc of ASOCIACION_LIST) {
        resumen[asoc] = { total: 0, sinDocs: 0, conDocs: 0, enCarrito: 0, entregadas: 0 };
    }

    for (const item of (data || [])) {
        const r = resumen[item.asociacion];
        if (!r) continue;
        r.total++;
        if (item.constancia_id) {
            r.entregadas++;
        } else if (item.en_carrito) {
            r.enCarrito++;
        } else if (item.docs_completos) {
            r.conDocs++;
        } else {
            r.sinDocs++;
        }
    }

    return resumen;
}

/**
 * Revert a delivered constancia back to the cart.
 * - All linked surgeries get constancia_id = null, en_carrito = true
 * - The constancia record is deleted from history
 */
export async function revertirConstancia(constanciaId) {
    // 1. Unlink all surgeries from this constancia and put them back in the cart
    const { error: unlinkErr } = await supabase
        .from('asociaciones_cirugias')
        .update({
            constancia_id: null,
            entregado_at: null,
            en_carrito: true,
        })
        .eq('constancia_id', constanciaId);

    if (unlinkErr) throw unlinkErr;

    // 2. Delete the constancia record
    const { error: deleteErr } = await supabase
        .from('asociaciones_constancias')
        .delete()
        .eq('id', constanciaId);

    if (deleteErr) throw deleteErr;
}
