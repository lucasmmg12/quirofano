/**
 * fichasAdmisionesService.js — Servicio para Entrega de Fichas de Admisiones Físicas
 * 
 * Gestiona el circuito diario de entrega de fichas (ej. 7am por Francisco):
 * - Consulta de admisiones pendientes, devueltas o en carrito
 * - Búsqueda por NHC, DNI, Nombre de paciente y N° de admisión
 * - Carrito de entrega para consolidar el lote diario
 * - Emisión de constancia/remito con firmas digitales (quien entrega y quien recibe)
 * - Devolución de fichas incompletas desde Administración a Recepción con motivo
 */
import { supabase } from '../lib/supabase';

// ─── Generador de Código de Remito Institucional ───
function generarCodigoRemito() {
    const hoy = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `ENT-FICHA-${hoy}-${rand}`;
}

// ─── 1. Traer Admisiones para la Entrega de Fichas ───
export async function fetchAdmisionesFichas({
    search = '',
    filtroEstado = 'pendientes', // 'pendientes', 'en_carrito', 'devueltas', 'entregadas', 'todas'
    page = 0,
    pageSize = 50
} = {}) {
    const from = page * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
        .from('altas_administrativas')
        .select(`
            id,
            numero_admision,
            id_paciente,
            nhc,
            paciente,
            cliente,
            especialidad,
            proceso,
            doctor,
            fecha_ingreso,
            operador,
            ficha_estado,
            ficha_en_carrito,
            ficha_carrito_por,
            ficha_carrito_at,
            ficha_ultima_entrega_id,
            ficha_devolucion_motivo,
            ficha_devolucion_at,
            ficha_devolucion_por,
            ficha_doc_estado,
            ficha_doc_incompleta_motivo
        `, { count: 'exact' });

    // Filtro por estado de la ficha física
    if (filtroEstado === 'pendientes') {
        query = query.or('ficha_estado.is.null,ficha_estado.eq.pendiente');
    } else if (filtroEstado === 'en_carrito') {
        query = query.eq('ficha_en_carrito', true);
    } else if (filtroEstado === 'devueltas') {
        query = query.eq('ficha_estado', 'devuelta_a_recepcion');
    } else if (filtroEstado === 'entregadas') {
        query = query.eq('ficha_estado', 'entregada');
    }

    // Buscador: NHC, DNI (id_paciente), Nombre del paciente, N° Admisión, Obra Social
    if (search && search.trim()) {
        const s = search.trim();
        query = query.or(`paciente.ilike.%${s}%,id_paciente.ilike.%${s}%,nhc.ilike.%${s}%,numero_admision.ilike.%${s}%,cliente.ilike.%${s}%`);
    }

    query = query.order('fecha_ingreso', { ascending: false }).range(from, to);

    const { data, error, count } = await query;
    if (error) {
        console.error('[fichasAdmisionesService] Error fetching admisiones:', error);
        throw error;
    }

    return {
        data: (data || []).map(a => ({
            ...a,
            dni: a.id_paciente || '—',
            nhc: a.nhc || '—',
            responsableRecepcion: a.operador || 'Recepción General'
        })),
        totalCount: count || 0
    };
}

// ─── 2. Contadores para Badges y Resumen ───
export async function fetchResumenFichas() {
    try {
        const [pendientesRes, carritoRes, devueltasRes, entregadasRes] = await Promise.all([
            supabase.from('altas_administrativas').select('id', { count: 'exact', head: true }).or('ficha_estado.is.null,ficha_estado.eq.pendiente'),
            supabase.from('altas_administrativas').select('id', { count: 'exact', head: true }).eq('ficha_en_carrito', true),
            supabase.from('altas_administrativas').select('id', { count: 'exact', head: true }).eq('ficha_estado', 'devuelta_a_recepcion'),
            supabase.from('altas_administrativas').select('id', { count: 'exact', head: true }).eq('ficha_estado', 'entregada')
        ]);

        return {
            pendientes: pendientesRes.count || 0,
            enCarrito: carritoRes.count || 0,
            devueltas: devueltasRes.count || 0,
            entregadas: entregadasRes.count || 0
        };
    } catch (err) {
        console.warn('[fichasAdmisionesService] Error getting resumen:', err);
        return { pendientes: 0, enCarrito: 0, devueltas: 0, entregadas: 0 };
    }
}

// ─── 3. Carrito de Fichas ───
export async function toggleCarritoFicha(admisionId, inCart, userDetails = 'Recepción') {
    const { error } = await supabase
        .from('altas_administrativas')
        .update({
            ficha_en_carrito: inCart,
            ficha_carrito_por: inCart ? userDetails : null,
            ficha_carrito_at: inCart ? new Date().toISOString() : null,
            ficha_estado: inCart ? 'en_carrito' : 'pendiente'
        })
        .eq('id', admisionId);

    if (error) throw error;
    return true;
}

export async function toggleMultipleCarritoFichas(admisionIds, inCart, userDetails = 'Recepción') {
    if (!admisionIds || admisionIds.length === 0) return true;

    const { error } = await supabase
        .from('altas_administrativas')
        .update({
            ficha_en_carrito: inCart,
            ficha_carrito_por: inCart ? userDetails : null,
            ficha_carrito_at: inCart ? new Date().toISOString() : null,
            ficha_estado: inCart ? 'en_carrito' : 'pendiente'
        })
        .in('id', admisionIds);

    if (error) throw error;
    return true;
}

export async function fetchCarritoFichas() {
    const { data, error } = await supabase
        .from('altas_administrativas')
        .select(`
            id,
            numero_admision,
            id_paciente,
            nhc,
            paciente,
            cliente,
            especialidad,
            proceso,
            doctor,
            fecha_ingreso,
            operador,
            ficha_doc_estado,
            ficha_doc_incompleta_motivo,
            ficha_devolucion_motivo
        `)
        .eq('ficha_en_carrito', true)
        .order('fecha_ingreso', { ascending: false });

    if (error) throw error;

    return (data || []).map(a => ({
        ...a,
        dni: a.id_paciente || '—',
        nhc: a.nhc || '—',
        responsableRecepcion: a.operador || 'Recepción General',
        estadoDoc: a.ficha_doc_estado || 'completa',
        motivoIncompleta: a.ficha_doc_incompleta_motivo || ''
    }));
}

export async function vaciarCarritoFichas() {
    const { error } = await supabase
        .from('altas_administrativas')
        .update({
            ficha_en_carrito: false,
            ficha_carrito_por: null,
            ficha_carrito_at: null,
            ficha_estado: 'pendiente'
        })
        .eq('ficha_en_carrito', true);

    if (error) throw error;
    return true;
}

// ─── 4. Emisión de Constancia / Remito de Entrega ───
export async function emitirEntregaFichas({
    items, // array de admisiones en el carrito con { id, docEstado, motivoIncompleta, ... }
    responsableEntrega = 'Francisco',
    firmaEntrega = null,
    responsableRecibe = 'Administración',
    firmaRecibe = null,
    observaciones = ''
}) {
    if (!items || items.length === 0) {
        throw new Error('No hay fichas en el carrito para entregar');
    }

    const codigo = generarCodigoRemito();
    const completas = items.filter(i => (i.docEstado || i.ficha_doc_estado) !== 'incompleta').length;
    const incompletas = items.length - completas;

    // 1. Insertar cabecera de la entrega
    const { data: entrega, error: entregaError } = await supabase
        .from('entregas_fichas_admisiones')
        .insert([{
            codigo,
            fecha_entrega: new Date().toISOString(),
            responsable_entrega: responsableEntrega.trim(),
            firma_entrega: firmaEntrega || null,
            responsable_recibe: responsableRecibe.trim(),
            firma_recibe: firmaRecibe || null,
            cantidad_fichas: items.length,
            fichas_completas: completas,
            fichas_incompletas: incompletas,
            observaciones: observaciones ? observaciones.trim() : null,
            estado: 'entregado'
        }])
        .select()
        .single();

    if (entregaError) {
        console.error('[fichasAdmisionesService] Error creando entrega:', entregaError);
        throw entregaError;
    }

    // 2. Insertar detalle por cada ficha
    const detalles = items.map(item => ({
        entrega_id: entrega.id,
        admision_id: item.id,
        numero_admision: item.numero_admision || '—',
        paciente: item.paciente,
        dni: item.dni || item.id_paciente || '—',
        nhc: item.nhc || '—',
        cliente: item.cliente || 'Particular',
        especialidad: item.especialidad || '—',
        fecha_ingreso: item.fecha_ingreso || null,
        responsable_recepcion: item.operador || item.responsableRecepcion || 'Recepción',
        estado_documentacion: (item.docEstado || item.ficha_doc_estado) === 'incompleta' ? 'incompleta' : 'completa',
        motivo_incompleta: (item.docEstado || item.ficha_doc_estado) === 'incompleta' ? (item.motivoIncompleta || item.ficha_doc_incompleta_motivo || 'Falta documentación requerida') : null,
        estado_ficha: 'aceptada'
    }));

    const { error: detalleError } = await supabase
        .from('entregas_fichas_detalle')
        .insert(detalles);

    if (detalleError) {
        console.error('[fichasAdmisionesService] Error insertando detalle:', detalleError);
        throw detalleError;
    }

    // 3. Actualizar altas_administrativas para marcar como entregadas y sacar del carrito
    const itemIds = items.map(i => i.id);
    const { error: altasError } = await supabase
        .from('altas_administrativas')
        .update({
            ficha_estado: 'entregada',
            ficha_en_carrito: false,
            ficha_carrito_por: null,
            ficha_carrito_at: null,
            ficha_ultima_entrega_id: entrega.id
        })
        .in('id', itemIds);

    if (altasError) {
        console.warn('[fichasAdmisionesService] Advertencia actualizando altas_administrativas:', altasError);
    }

    return {
        ...entrega,
        detalles
    };
}

// ─── 5. Historial de Entregas ───
export async function fetchHistorialEntregas({
    search = '',
    page = 0,
    pageSize = 30
} = {}) {
    const from = page * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
        .from('entregas_fichas_admisiones')
        .select('*', { count: 'exact' });

    if (search && search.trim()) {
        const s = search.trim();
        query = query.or(`codigo.ilike.%${s}%,responsable_entrega.ilike.%${s}%,responsable_recibe.ilike.%${s}%,observaciones.ilike.%${s}%`);
    }

    query = query.order('fecha_entrega', { ascending: false }).range(from, to);

    const { data, error, count } = await query;
    if (error) throw error;

    return {
        data: data || [],
        totalCount: count || 0
    };
}

export async function fetchEntregaConDetalle(entregaId) {
    const { data: entrega, error: entregaError } = await supabase
        .from('entregas_fichas_admisiones')
        .select('*')
        .eq('id', entregaId)
        .single();

    if (entregaError) throw entregaError;

    const { data: detalles, error: detalleError } = await supabase
        .from('entregas_fichas_detalle')
        .select('*')
        .eq('entrega_id', entregaId)
        .order('created_at', { ascending: true });

    if (detalleError) throw detalleError;

    return {
        ...entrega,
        detalles: detalles || []
    };
}

// ─── 6. Devolución de Ficha a Recepción (por falta de info/autorización/garantía) ───
export async function devolverFichaARecepcion({
    detalleId,
    admisionId,
    entregaId,
    motivo = 'Falta documentación o autorización',
    responsable = 'Administración'
}) {
    if (!motivo || !motivo.trim()) {
        throw new Error('Debe especificar el motivo de la devolución a Recepción');
    }

    const now = new Date().toISOString();

    // 1. Actualizar el detalle de la entrega
    if (detalleId) {
        await supabase
            .from('entregas_fichas_detalle')
            .update({
                estado_ficha: 'devuelta_a_recepcion',
                devolucion_motivo: motivo.trim(),
                devolucion_at: now,
                devolucion_por: responsable
            })
            .eq('id', detalleId);
    }

    // 2. Actualizar la cabecera de la entrega a 'con_devoluciones'
    if (entregaId) {
        await supabase
            .from('entregas_fichas_admisiones')
            .update({ estado: 'con_devoluciones' })
            .eq('id', entregaId);
    }

    // 3. Devolver la admisión al estado 'devuelta_a_recepcion' para que Recepción la vea en su bandeja
    if (admisionId) {
        await supabase
            .from('altas_administrativas')
            .update({
                ficha_estado: 'devuelta_a_recepcion',
                ficha_devolucion_motivo: motivo.trim(),
                ficha_devolucion_at: now,
                ficha_devolucion_por: responsable,
                ficha_en_carrito: false
            })
            .eq('id', admisionId);
    }

    return true;
}

// ─── 7. Subsanar Ficha Devuelta (Recepción completó lo que faltaba) ───
export async function subsanarFichaDevuelta(admisionId, detalleId = null) {
    const now = new Date().toISOString();

    if (admisionId) {
        await supabase
            .from('altas_administrativas')
            .update({
                ficha_estado: 'pendiente',
                ficha_doc_estado: 'completa',
                ficha_doc_incompleta_motivo: null,
                ficha_devolucion_motivo: null
            })
            .eq('id', admisionId);
    }

    if (detalleId) {
        await supabase
            .from('entregas_fichas_detalle')
            .update({
                subsanada_at: now
            })
            .eq('id', detalleId);
    }

    return true;
}
