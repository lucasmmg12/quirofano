import { supabase } from '../lib/supabase';

// Obtiene todas las admisiones que tienen una garantía o que podrían tenerla.
export async function fetchGarantias() {
    const { data, error } = await supabase
        .from('altas_administrativas')
        .select(`
            id, paciente, id_paciente, cliente, fecha_ingreso, especialidad,
            numero_admision,
            garantia_estado, garantia_ubicacion, 
            en_carrito_rendicion, carrito_rendicion_por,
            rendicion_garantia_id
        `)
        .order('fecha_ingreso', { ascending: false });

    if (error) throw error;
    return (data || []).map(g => ({
        ...g,
        dni: g.id_paciente
    }));
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

export async function toggleCarritoRendicion(surgeryId, inCart, userDetails) {
    const { error } = await supabase
        .from('altas_administrativas')
        .update({
            en_carrito_rendicion: inCart,
            carrito_rendicion_por: inCart ? userDetails : null,
            carrito_rendicion_at: inCart ? new Date().toISOString() : null
        })
        .eq('id', surgeryId);

    if (error) throw error;
    
    // Log history con las columnas correctas del schema
    await supabase.from('garantias_historial').insert([{
        surgery_id: surgeryId,
        tipo_movimiento: inCart ? 'Agregado al Carrito' : 'Quitado del Carrito',
        usuario: userDetails,
        origen: 'Recepción',
        destino: inCart ? 'Carrito Rendición' : 'Recepción',
        estado_vigente: 'Pendiente',
        observaciones: null
    }]);
}

// Cambiar estado administrativo
export async function cambiarEstadoGarantia(surgeryId, updates, userDetails, nota = null) {
    const updateData = { ...updates };
    
    // If state changes to Archivada, record the date
    if (updates.garantia_estado === 'Archivada') {
        updateData.garantia_fecha_archivada = new Date().toISOString().split('T')[0];
    } else if (updates.garantia_estado && updates.garantia_estado !== 'Archivada') {
        // Clear archived date if it moves out of archived state
        updateData.garantia_fecha_archivada = null;
    }

    const { error } = await supabase
        .from('altas_administrativas')
        .update(updateData)
        .eq('id', surgeryId);

    if (error) throw error;
}

// Obtener las garantías actualmente en el carrito de rendición
export async function fetchCarritoRendicion(usuario) {
    const { data, error } = await supabase
        .from('altas_administrativas')
        .select('id, paciente, id_paciente, especialidad, fecha_ingreso, cliente')
        .eq('en_carrito_rendicion', true)
        .order('carrito_rendicion_at', { ascending: true });

    if (error) throw error;
    return (data || []).map(g => ({
        ...g,
        dni: g.id_paciente
    }));
}

// Emitir rendición (Mueve de Recepción a Administración y guarda la rendición)
export async function emitirRendicion(garantiasIds, data, userDetails) {
    if (!garantiasIds.length) throw new Error("No hay garantías en el carrito");

    const codigo = `REN-${new Date().toISOString().split('T')[0].replace(/-/g,'')}-${Math.floor(Math.random()*10000).toString().padStart(4,'0')}`;

    // 1. Crear la rendición en rendiciones_garantias
    const rendicion = {
        codigo: codigo,
        responsable_entrega: data.entrega,
        responsable_recibe: data.recibe,
        observaciones: data.notas,
        firma_entrega: data.firma_entrega,
        firma_recibe: data.firma_recibe,
        cantidad_garantias: garantiasIds.length,
        created_at: new Date().toISOString()
    };

    const { data: rendicionData, error: rendicionError } = await supabase
        .from('rendiciones_garantias')
        .insert([rendicion])
        .select('id')
        .single();

    if (rendicionError) throw rendicionError;

    // 2. Actualizar las altas (garantías) asociadas
    const { error: updateError } = await supabase
        .from('altas_administrativas')
        .update({
            rendicion_garantia_id: rendicionData.id,
            garantia_estado: 'Activa',
            garantia_ubicacion: 'Administración',
            en_carrito_rendicion: false,
            carrito_rendicion_por: null,
            carrito_rendicion_at: null
        })
        .in('id', garantiasIds);

    if (updateError) throw updateError;

    // 3. Registrar en el historial para cada cirugía
    const historialEntries = garantiasIds.map(id => ({
        surgery_id: id,
        usuario: userDetails,
        tipo_movimiento: 'Rendición de Garantía',
        origen: 'Recepción',
        destino: 'Administración',
        estado_vigente: 'Activa',
        observaciones: `Rendición ${codigo}`
    }));

    await supabase.from('garantias_historial').insert(historialEntries);

    return { ...rendicion, codigo };
}
