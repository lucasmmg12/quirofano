/**
 * laboratoriosCartService.js — Cart & delivery service for Anatomía Patológica
 *
 * Mirrors the asociacionesService cart pattern:
 *   Pendientes → Carrito → Constancia (Historial)
 *   Agrupado por Laboratorio (Agüero / CEDAP / Cuyo)
 */
import { supabase } from '../lib/supabase';
import { logAction, AUDIT_ACTIONS } from './laboratoriosAuditService';

// ═══════════════════════════════════════════
// Color palette for labs (like ASOCIACION_COLORS)
// ═══════════════════════════════════════════
export const LAB_COLORS = {
    'LDA - Dra. Aguero o Dra Rios': '#8B5CF6',
    'LAB. CEDAP':                    '#0EA5E9',
    'LAB.INST.PATOLOG.CUYO':         '#F59E0B',
};

export const LAB_SHORT_NAMES = {
    'LDA - Dra. Aguero o Dra Rios': 'Agüero',
    'LAB. CEDAP':                    'CEDAP',
    'LAB.INST.PATOLOG.CUYO':         'Cuyo',
};

export const LAB_LIST = Object.keys(LAB_COLORS);

/**
 * Fetch lab records from the main table.
 * @param {object} opts
 * @param {boolean} opts.soloSinCarrito - If true, exclude items already in cart
 * @param {boolean} opts.soloCarrito    - If true, only fetch cart items
 */
export async function fetchLabRecords({ soloSinCarrito = false, soloCarrito = false, fromDate = null, toDate = null } = {}) {
    const buildQuery = () => {
        let q = supabase
            .from('laboratorios_anatomia_patologica')
            .select('*')
            .order('fecha_visita', { ascending: false });

        if (fromDate) q = q.gte('fecha_visita', fromDate);
        if (toDate) q = q.lte('fecha_visita', toDate);

        if (soloSinCarrito) {
            q = q.is('constancia_id', null).or('en_carrito.is.null,en_carrito.eq.false');
        }
        if (soloCarrito) {
            q = q.is('constancia_id', null).eq('en_carrito', true);
        }
        return q;
    };

    const PAGE_SIZE = 1000;
    let allData = [];
    let from = 0;
    let hasMore = true;

    while (hasMore) {
        const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        allData = allData.concat(data || []);
        hasMore = (data || []).length === PAGE_SIZE;
        from += PAGE_SIZE;
    }

    return allData;
}

// ═══════════════════════════════════════════
// Cart operations
// ═══════════════════════════════════════════
export async function enviarAlCarritoLab(idVisita, { usuario = 'sistema', paciente = null, laboratorio = null } = {}) {
    const { error } = await supabase
        .from('laboratorios_anatomia_patologica')
        .update({ 
            en_carrito: true,
            carrito_por: usuario,
            carrito_at: new Date().toISOString()
        })
        .eq('id_visita', idVisita);
    if (error) throw error;

    // Audit log (non-blocking)
    logAction({
        accion: AUDIT_ACTIONS.ENVIAR_CARRITO,
        usuario,
        id_visita: idVisita,
        paciente,
        laboratorio,
        detalle: `Envió al carrito el registro ${idVisita}`,
    });
}

export async function quitarDelCarritoLab(idVisita, { usuario = 'sistema', paciente = null, laboratorio = null } = {}) {
    const { error } = await supabase
        .from('laboratorios_anatomia_patologica')
        .update({ 
            en_carrito: false,
            carrito_por: null,
            carrito_at: null
        })
        .eq('id_visita', idVisita);
    if (error) throw error;

    // Audit log (non-blocking)
    logAction({
        accion: AUDIT_ACTIONS.QUITAR_CARRITO,
        usuario,
        id_visita: idVisita,
        paciente,
        laboratorio,
        detalle: `Quitó del carrito el registro ${idVisita}`,
    });
}

export async function fetchCarritoLab() {
    return fetchLabRecords({ soloCarrito: true });
}

// ═══════════════════════════════════════════
// Constancia generation
// ═══════════════════════════════════════════
export async function generarConstanciaLab({
    laboratorio,
    items,
    responsable,
    nombreCadete,
    notas,
}) {
    // 1. Generate sequential code
    const { count } = await supabase
        .from('laboratorios_constancias')
        .select('id', { count: 'exact', head: true });
    const nextNum = (count || 0) + 1;
    const codigo = `LAB-${String(nextNum).padStart(3, '0')}`;

    // 2. Create constancia
    const { data: constancia, error: constErr } = await supabase
        .from('laboratorios_constancias')
        .insert({
            codigo,
            laboratorio,
            responsable_entrega: responsable,
            nombre_cadete: nombreCadete,
            cantidad_registros: items.length,
            notas: notas || null,
        })
        .select()
        .single();

    if (constErr) throw constErr;

    // 3. Link items to constancia
    const ids = items.map(i => i.id_visita);
    const { error: linkErr } = await supabase
        .from('laboratorios_anatomia_patologica')
        .update({
            constancia_id: constancia.id,
            en_carrito: false,
            entregado_at: new Date().toISOString(),
        })
        .in('id_visita', ids);

    if (linkErr) throw linkErr;

    // Audit log (non-blocking)
    logAction({
        accion: AUDIT_ACTIONS.GENERAR_CONSTANCIA,
        usuario: responsable,
        laboratorio,
        detalle: `Constancia ${codigo} generada con ${items.length} registros. Cadete: ${nombreCadete || 'N/A'}`,
        datos_despues: {
            codigo,
            cantidad: items.length,
            cadete: nombreCadete,
            items: ids,
        },
    });

    return constancia;
}

// ═══════════════════════════════════════════
// Historial
// ═══════════════════════════════════════════
export async function fetchConstanciasLab({ laboratorio, search } = {}) {
    let query = supabase
        .from('laboratorios_constancias')
        .select('*')
        .order('fecha_entrega', { ascending: false });

    if (laboratorio) {
        query = query.eq('laboratorio', laboratorio);
    }

    if (search) {
        const safeSearch = search.trim().replace(/[\s,]+/g, '%');
        const { data: matchedDetalle, error: searchError } = await supabase
            .from('laboratorios_anatomia_patologica')
            .select('constancia_id')
            .not('constancia_id', 'is', null)
            .or(`paciente.ilike.%${safeSearch}%,dni.ilike.%${safeSearch}%,n_admision.ilike.%${safeSearch}%`);
        
        if (searchError) {
            console.error("Error buscando en historial de laboratorios:", searchError);
        }
        
        const matchedIds = [...new Set((matchedDetalle || []).map(a => a.constancia_id))];
        if (matchedIds.length > 0) {
            query = query.in('id', matchedIds);
        } else {
            return [];
        }
    } else {
        query = query.limit(1000);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
}

export async function fetchConstanciaDetalleLab(constanciaId) {
    const { data, error } = await supabase
        .from('laboratorios_anatomia_patologica')
        .select('*')
        .eq('constancia_id', constanciaId)
        .order('fecha_visita', { ascending: true });
    if (error) throw error;
    return data || [];
}

/**
 * Revert a constancia: unlink items → cart, delete constancia
 */
export async function revertirConstanciaLab(constanciaId, { usuario = 'sistema', codigo = '' } = {}) {
    const { error: unlinkErr } = await supabase
        .from('laboratorios_anatomia_patologica')
        .update({
            constancia_id: null,
            entregado_at: null,
            en_carrito: true,
            carrito_por: null,
            carrito_at: null,
        })
        .eq('constancia_id', constanciaId);
    if (unlinkErr) throw unlinkErr;

    const { error: deleteErr } = await supabase
        .from('laboratorios_constancias')
        .delete()
        .eq('id', constanciaId);
    if (deleteErr) throw deleteErr;

    // Audit log (non-blocking)
    logAction({
        accion: AUDIT_ACTIONS.REVERTIR_CONSTANCIA,
        usuario,
        detalle: `Constancia ${codigo || constanciaId} revertida`,
        datos_antes: { constancia_id: constanciaId, codigo },
    });
}
