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
    'Alta Adm. Parcial':{ label: 'Alta Adm. Parcial',color: '#0D9488', bg: '#CCFBF1', icon: '✂️' },
    'Suspendida':       { label: 'Suspendida',       color: '#EF4444', bg: '#FEF2F2', icon: '⛔' },
    'Particular':       { label: 'Particular',       color: '#6B7280', bg: '#F3F4F6', icon: '👤' },
    'Interconsulta':    { label: 'Interconsulta',    color: '#3B82F6', bg: '#EFF6FF', icon: '🔄' },
    'Vacío':            { label: 'Vacío',            color: '#94A3B8', bg: '#F8FAFC', icon: '◽' },
    'Pasa al mes que viene': { label: 'Pasa al mes que viene', color: '#6366F1', bg: '#E0E7FF', icon: '⏭️' },

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

        if (toDate) query = query.lte('fecha_ingreso', toDate);
        if (fromDate) {
            // Incluir admisiones que: ingresaron en el mes, O tienen alta en el mes,
            // O siguen internadas (sin alta) PERO ingresaron antes del fin del mes seleccionado.
            // La cláusula and(fecha_alta.is.null,...) evita traer admisiones antiguas sin alta
            // de meses muy anteriores al rango seleccionado.
            if (toDate) {
                query = query.or(`fecha_ingreso.gte.${fromDate},fecha_alta.gte.${fromDate},and(fecha_alta.is.null,fecha_ingreso.lte.${toDate})`);
            } else {
                query = query.or(`fecha_ingreso.gte.${fromDate},fecha_alta.gte.${fromDate},fecha_alta.is.null`);
            }
        }
        if (search) {
            // Sanitizar: escapar caracteres especiales de PostgREST para que la búsqueda
            // no se rompa con comas, paréntesis, puntos, etc.
            const sanitized = search
                .replace(/\\/g, '\\\\')
                .replace(/\(/g, '\\(')
                .replace(/\)/g, '\\)')
                .replace(/%/g, '\\%')
                .trim()
                .replace(/[\s,]+/g, '%');
            query = query.or(`paciente.ilike.%${sanitized}%,doctor.ilike.%${sanitized}%,cliente.ilike.%${sanitized}%,numero_admision.ilike.%${sanitized}%`);
        }

        const { data, error } = await query;
        if (error) throw error;

        const rows = data || [];
        // Filtro por frontend: No mostrar admisiones con especialidad CHEQUEO que empiecen con A
        const filteredRows = rows.filter(row => 
            !(row.numero_admision?.toUpperCase().startsWith('A') && row.especialidad?.toUpperCase() === 'CHEQUEO')
        );
        allData = allData.concat(filteredRows);
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
 * Genera un número de admisión único con sufijo -P1, -P2, etc. para la continuación/prórroga de una admisión
 */
export async function generateNextNumeroAdmision(baseNum) {
    if (!baseNum) return null;
    const cleanBase = baseNum.replace(/-P\d*$/i, '');

    const { data: existing } = await supabase
        .from('altas_administrativas')
        .select('numero_admision')
        .ilike('numero_admision', `${cleanBase}%`);

    let maxP = 0;
    if (existing && existing.length > 0) {
        existing.forEach(row => {
            const numStr = row.numero_admision || '';
            const match = numStr.match(/-P(\d+)$/i);
            if (match) {
                const val = parseInt(match[1], 10);
                if (val > maxP) maxP = val;
            } else if (numStr.toLowerCase().endsWith('-p')) {
                if (maxP < 1) maxP = 1;
            }
        });
    }
    return `${cleanBase}-P${maxP + 1}`;
}

/**
 * Actualiza el estado de un alta
 */
export async function updateAltaEstado(id, estado, operador = 'operador', selectedMonth = null) {
    // Si el registro tiene devolución activa, limpiar los campos de devolución
    const { data: current } = await supabase
        .from('altas_administrativas')
        .select('*')
        .eq('id', id)
        .single();

    let updatePayload = { estado, operador };
    if (current?.devolucion_id && current?.estado_fac === 'Devuelta') {
        updatePayload.devolucion_id = null;
        updatePayload.estado_fac = 'Pendiente';
    }

    // Lógica de "Prórroga" y "Alta Adm. Parcial" para crear continuación el mes que viene
    let duplicateRecord = null;
    if (estado === 'Prórroga' || estado === 'Alta Adm. Parcial') {
        // La ficha original siempre queda como "Alta Adm. Parcial"
        updatePayload.estado = 'Alta Adm. Parcial';

        // Determinar inicio del mes siguiente basado en el mes de ingreso de la ficha actual
        const d = new Date(current.fecha_ingreso || new Date());
        const m = d.getMonth() + 1;
        const y = d.getFullYear();
        const nextY = m === 12 ? y + 1 : y;
        const nextM = m === 12 ? 1 : m + 1;
        const nextMonthStart = `${nextY}-${String(nextM).padStart(2, '0')}-01T00:00:00.000Z`;

        const newNumeroAdmision = await generateNextNumeroAdmision(current.numero_admision);

        const { id: oldId, created_at, ...rest } = current;
        duplicateRecord = {
            ...rest,
            numero_admision: newNumeroAdmision,
            fecha_ingreso: nextMonthStart,
            estado: estado === 'Prórroga' ? 'Prórroga' : null, // Prórroga -> Prórroga, Alta Parcial -> Vacío
            estado_fac: 'Pendiente',
            notas_internas: (current.notas_internas ? current.notas_internas + '\n\n' : '') + `[Corte Manual] ${estado} arrastrada desde ${new Date(current.fecha_ingreso).toLocaleDateString('es-AR')}`,
            en_carrito_traspaso: false,
            carrito_traspaso_por: null,
            carrito_traspaso_at: null,
            traspaso_id: null,
            traspasada_at: null,
            traspasada_por: null
        };
    }

    const { data, error } = await supabase
        .from('altas_administrativas')
        .update(updatePayload)
        .eq('id', id)
        .select()
        .single();
    if (error) throw error;

    if (duplicateRecord) {
        const { error: insertErr } = await supabase
            .from('altas_administrativas')
            .insert(duplicateRecord);
        if (insertErr) throw insertErr;
    }

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

        if (toDate) query = query.lte('fecha_ingreso', toDate);
        if (fromDate) {
            if (toDate) {
                query = query.or(`fecha_ingreso.gte.${fromDate},fecha_alta.gte.${fromDate},and(fecha_alta.is.null,fecha_ingreso.lte.${toDate})`);
            } else {
                query = query.or(`fecha_ingreso.gte.${fromDate},fecha_alta.gte.${fromDate},fecha_alta.is.null`);
            }
        }

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
    'Pendiente':    { label: 'Pendiente de repartir', color: '#94A3B8', bg: '#F8FAFC', icon: '⏳' },
    'PENDIENTE':    { label: 'PENDIENTE',             color: '#64748B', bg: '#F1F5F9', icon: '📝' },
    'En proceso':   { label: 'En proceso',   color: '#F59E0B', bg: '#FFFBEB', icon: '🔄' },
    'Falta biopsia':{ label: 'Falta biopsia',color: '#D946EF', bg: '#FDF4FF', icon: '🔬' },
    'Alta prox. mes':{label: 'Alta prox. mes',color:'#6366F1', bg: '#EEF2FF', icon: '⏭️' },
    'Hc incompleta':{ label: 'Hc incompleta',color: '#F97316', bg: '#FFF7ED', icon: '📄' },
    'Parcial':      { label: 'Parcial',      color: '#0EA5E9', bg: '#F0F9FF', icon: '✂️' },
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

        if (toDate) query = query.lte('fecha_ingreso', toDate);
        if (fromDate) {
            if (toDate) {
                query = query.or(`fecha_ingreso.gte.${fromDate},fecha_alta.gte.${fromDate},and(fecha_alta.is.null,fecha_ingreso.lte.${toDate})`);
            } else {
                query = query.or(`fecha_ingreso.gte.${fromDate},fecha_alta.gte.${fromDate},fecha_alta.is.null`);
            }
        }
        if (search) {
            const sanitized = search
                .replace(/\\/g, '\\\\')
                .replace(/\(/g, '\\(')
                .replace(/\)/g, '\\)')
                .replace(/%/g, '\\%')
                .trim()
                .replace(/[\s,]+/g, '%');
            query = query.or(`paciente.ilike.%${sanitized}%,doctor.ilike.%${sanitized}%,cliente.ilike.%${sanitized}%,numero_admision.ilike.%${sanitized}%`);
        }

        const { data, error } = await query;
        if (error) throw error;

        const rows = data || [];
        // Filtro por frontend: No mostrar admisiones con especialidad CHEQUEO que empiecen con A
        const filteredRows = rows.filter(row => 
            !(row.numero_admision?.toUpperCase().startsWith('A') && row.especialidad?.toUpperCase() === 'CHEQUEO')
        );
        allData = allData.concat(filteredRows);
        hasMore = rows.length === PAGE_SIZE;
        from += PAGE_SIZE;
    }

    // Traer admisiones hermanas (duplicados de la misma internación) para los pacientes en la lista
    // así Facturación puede realizar la fusión completa con datos clínicos/altas
    if (allData.length > 0) {
        const patientNames = [...new Set(allData.map(r => r.paciente).filter(Boolean))];
        const existingIds = new Set(allData.map(r => r.id));
        const BATCH_SIZE = 50;

        for (let i = 0; i < patientNames.length; i += BATCH_SIZE) {
            const batchNames = patientNames.slice(i, i + BATCH_SIZE);
            const { data: siblings } = await supabase
                .from('altas_administrativas')
                .select('*')
                .in('paciente', batchNames);

            if (siblings && siblings.length > 0) {
                for (const s of siblings) {
                    if (!existingIds.has(s.id)) {
                        if (!(s.numero_admision?.toUpperCase().startsWith('A') && s.especialidad?.toUpperCase() === 'CHEQUEO')) {
                            allData.push(s);
                            existingIds.add(s.id);
                        }
                    }
                }
            }
        }
    }

    if (search) {
        const s = search.toLowerCase().trim();
        allData = allData.filter(a =>
            (a.paciente || '').toLowerCase().includes(s) ||
            (a.doctor || '').toLowerCase().includes(s) ||
            (a.cliente || '').toLowerCase().includes(s) ||
            (a.numero_admision || '').toLowerCase().includes(s)
        );
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
    const { data: current } = await supabase
        .from('altas_administrativas')
        .select('estado_fac')
        .eq('id', id)
        .single();

    let updatePayload = { responsable_fac };
    if (responsable_fac && (!current?.estado_fac || current.estado_fac === 'Pendiente')) {
        updatePayload.estado_fac = 'En proceso';
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
export async function fetchTraspasos({ search, limit = 100 } = {}) {
    let query = supabase
        .from('altas_traspasos')
        .select('*')
        .order('fecha_traspaso', { ascending: false });

    if (search) {
        const safeSearch = search.trim().replace(/[\s,]+/g, '%');
        const { data: matchedDetalle } = await supabase
            .from('altas_administrativas')
            .select('traspaso_id')
            .not('traspaso_id', 'is', null)
            .or(`paciente.ilike.%${safeSearch}%,doctor.ilike.%${safeSearch}%`);
        
        const matchedIds = [...new Set((matchedDetalle || []).map(a => a.traspaso_id))];
        if (matchedIds.length > 0) {
            query = query.in('id', matchedIds);
        } else {
            return [];
        }
    } else {
        query = query.limit(limit);
    }

    const { data, error } = await query;
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
export async function fetchDevoluciones({ search, limit = 100 } = {}) {
    let query = supabase
        .from('facturacion_devoluciones')
        .select('*')
        .order('fecha_devolucion', { ascending: false });

    if (search) {
        const safeSearch = search.trim().replace(/[\s,]+/g, '%');
        const { data: matchedDetalle } = await supabase
            .from('altas_administrativas')
            .select('devolucion_id')
            .not('devolucion_id', 'is', null)
            .or(`nombre_paciente.ilike.%${safeSearch}%,dni.ilike.%${safeSearch}%,cirujano.ilike.%${safeSearch}%`);
        
        const matchedIds = [...new Set((matchedDetalle || []).map(a => a.devolucion_id))];
        if (matchedIds.length > 0) {
            query = query.in('id', matchedIds);
        } else {
            return [];
        }
    } else {
        query = query.limit(limit);
    }

    const { data, error } = await query;
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

/**
 * Ejecuta el corte de mes para internaciones prolongadas
 * Busca pacientes sin alta en el rango dado (mes), los pasa a "Alta Adm. Parcial",
 * y crea una prórroga para el día 1 del mes siguiente.
 */
export async function ejecutarCorteDeMesProlongadas(fromDate, toDate) {
    if (!fromDate || !toDate) throw new Error('Se requiere rango de fechas (mes)');

    // 1. Buscar las fichas del mes que no tienen fecha de alta
    const { data: prolongadas, error: fetchErr } = await supabase
        .from('altas_administrativas')
        .select('*')
        .gte('fecha_ingreso', fromDate)
        .lte('fecha_ingreso', toDate)
        .is('fecha_alta', null)
        .not('estado', 'eq', 'Suspendida')
        .not('estado', 'eq', 'Alta Adm. Parcial');

    if (fetchErr) throw fetchErr;
    if (!prolongadas || prolongadas.length === 0) {
        return { count: 0, message: 'No hay internaciones prolongadas sin alta en este mes.' };
    }

    // Calcular el día 1 del mes siguiente
    const [y, m] = fromDate.split('-').map(Number);
    const nextY = m === 12 ? y + 1 : y;
    const nextM = m === 12 ? 1 : m + 1;
    // Creamos la fecha a las 00:00:00
    const nextMonthStart = `${nextY}-${String(nextM).padStart(2, '0')}-01T00:00:00.000Z`;

    // Preparar nuevos registros para el mes siguiente
    const nuevosRegistros = [];
    for (const p of prolongadas) {
        const newNumeroAdmision = await generateNextNumeroAdmision(p.numero_admision);
        const { id, created_at, ...rest } = p;
        nuevosRegistros.push({
            ...rest,
            numero_admision: newNumeroAdmision,
            fecha_ingreso: nextMonthStart,
            estado: 'Prórroga',
            estado_fac: 'Pendiente',
            notas_internas: (p.notas_internas ? p.notas_internas + '\n\n' : '') + `[Corte Automático] Prórroga arrastrada desde ${new Date(p.fecha_ingreso).toLocaleDateString('es-AR')}`,
            en_carrito_traspaso: false,
            carrito_traspaso_por: null,
            carrito_traspaso_at: null,
            traspaso_id: null,
            traspasada_at: null,
            traspasada_por: null
        });
    }

    // Ejecutar transacciones
    // a. Actualizar viejos a "Alta Adm. Parcial"
    const idsOld = prolongadas.map(p => p.id);
    const { error: updErr } = await supabase
        .from('altas_administrativas')
        .update({ estado: 'Alta Adm. Parcial' })
        .in('id', idsOld);

    if (updErr) throw updErr;

    // b. Insertar nuevos
    const { error: insErr } = await supabase
        .from('altas_administrativas')
        .insert(nuevosRegistros);

    if (insErr) throw insErr;

    return { count: prolongadas.length, message: `Se procesaron ${prolongadas.length} internaciones prolongadas.` };
}

// ─── Reingreso Real ───
export async function setReingresoReal(id, isReingresoReal) {
    const { data, error } = await supabase
        .from('altas_administrativas')
        .update({ is_reingreso_real: isReingresoReal })
        .eq('id', id)
        .select();
    if (error) throw error;
    return data;
}
