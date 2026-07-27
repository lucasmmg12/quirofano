import { supabase } from '../lib/supabase';

// Obtiene todas las cirugías que tienen una garantía o que podrían tenerla.
export async function fetchGarantias() {
    const { data, error } = await supabase
        .from('surgeries')
        .select(`
            id, nombre, dni, obra_social, fecha_cirugia, modulo, 
            garantia_estado, garantia_ubicacion, 
            en_carrito_rendicion, carrito_rendicion_por,
            rendicion_garantia_id,
            rendiciones_garantias(codigo)
        `)
        .eq('excluido', false)
        .order('fecha_cirugia', { ascending: false });

    if (error) throw error;
    return data || [];
}

// Obtener el historial de movimientos de una garantía
export async function fetchHistorialGarantia(surgeryId) {
    const { data, error } = await supabase
        .from('garantias_historial')
        .select('*')
        .eq('surgery_id', surgeryId)
        .order('fecha_movimiento', { ascending: false });

    if (error) throw error;
    return data || [];
}

// Cambiar estado o ubicación de una garantía manualmente
export async function cambiarEstadoGarantia(surgeryId, updates, usuario, tipoMovimiento = 'Cambio de Estado', observaciones = '') {
    // 1. Obtener estado anterior
    const { data: oldData } = await supabase
        .from('surgeries')
        .select('garantia_estado, garantia_ubicacion')
        .eq('id', surgeryId)
        .single();
    
    // 2. Actualizar cirugía
    const { data, error } = await supabase
        .from('surgeries')
        .update(updates)
        .eq('id', surgeryId)
        .select()
        .single();
    if (error) throw error;

    // 3. Registrar en historial
    await supabase.from('garantias_historial').insert([{
        surgery_id: surgeryId,
        usuario,
        tipo_movimiento: tipoMovimiento,
        origen: oldData?.garantia_ubicacion || 'Recepción',
        destino: updates.garantia_ubicacion || oldData?.garantia_ubicacion || 'Recepción',
        estado_vigente: updates.garantia_estado || oldData?.garantia_estado || 'Activa',
        observaciones: observaciones
    }]);

    return data;
}

// Agregar o quitar del carrito de rendición
export async function toggleCarritoRendicion(surgeryId, enCarrito, usuario) {
    const updates = {
        en_carrito_rendicion: enCarrito,
        carrito_rendicion_por: enCarrito ? usuario : null,
        carrito_rendicion_at: enCarrito ? new Date().toISOString() : null
    };

    const { data, error } = await supabase
        .from('surgeries')
        .update(updates)
        .eq('id', surgeryId)
        .select()
        .single();
    
    if (error) throw error;
    return data;
}

// Obtener las garantías actualmente en el carrito de rendición
export async function fetchCarritoRendicion(usuario) {
    const { data, error } = await supabase
        .from('surgeries')
        .select('id, nombre, dni, obra_social, fecha_cirugia')
        .eq('en_carrito_rendicion', true)
        // .eq('carrito_rendicion_por', usuario) // Descomentar si el carrito es por usuario estrictamente
        .order('carrito_rendicion_at', { ascending: true });

    if (error) throw error;
    return data || [];
}

// Emitir rendición (Mueve de Recepción a Administración y guarda la rendición)
export async function emitirRendicion(surgeryIds, usuario, firmaUsuario) {
    if (!surgeryIds || surgeryIds.length === 0) throw new Error("No hay garantías seleccionadas.");

    const codigo = `REN-${Date.now().toString().slice(-6)}`;
    
    // 1. Crear registro de rendición
    const { data: rendicion, error: rError } = await supabase
        .from('rendiciones_garantias')
        .insert([{
            codigo,
            responsable_entrega: usuario,
            firma_entrega: firmaUsuario, // Firma digital
            cantidad_garantias: surgeryIds.length
        }])
        .select()
        .single();
    
    if (rError) throw rError;

    // 2. Actualizar las cirugías
    const updates = {
        en_carrito_rendicion: false,
        carrito_rendicion_por: null,
        carrito_rendicion_at: null,
        garantia_ubicacion: 'Administración',
        rendicion_garantia_id: rendicion.id
    };

    const { error: sError } = await supabase
        .from('surgeries')
        .update(updates)
        .in('id', surgeryIds);

    if (sError) throw sError;

    // 3. Registrar en el historial para cada cirugía
    const historialEntries = surgeryIds.map(id => ({
        surgery_id: id,
        usuario,
        tipo_movimiento: 'Rendición de Garantía',
        origen: 'Recepción',
        destino: 'Administración',
        estado_vigente: 'Activa',
        observaciones: `Rendición ${codigo}`
    }));

    await supabase.from('garantias_historial').insert(historialEntries);

    return rendicion;
}
