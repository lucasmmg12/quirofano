import { supabase } from '../lib/supabase';

/**
 * Módulo de Gestión de Activos y Mantenimiento (CMMS)
 */

export async function fetchSedes() {
    const { data, error } = await supabase
        .from('activos_sedes')
        .select('*')
        .eq('activo', true)
        .order('nombre');
    
    if (error) throw new Error(error.message);
    return data;
}

export async function fetchEquipos(sedeId = null) {
    let query = supabase
        .from('activos_equipos')
        .select('*, activos_sedes(nombre)')
        .order('fecha_alta', { ascending: false });
    
    if (sedeId) {
        query = query.eq('sede_id', sedeId);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data;
}

export async function fetchEquipoById(id) {
    const { data, error } = await supabase
        .from('activos_equipos')
        .select('*, activos_sedes(nombre)')
        .eq('id', id)
        .single();
    
    if (error) throw new Error(error.message);
    return data;
}

export async function crearEquipo(equipoData) {
    const { data, error } = await supabase
        .from('activos_equipos')
        .insert([{
            nombre: equipoData.nombre,
            marca: equipoData.marca,
            modelo: equipoData.modelo,
            sede_id: equipoData.sede_id,
            estado_operativo: equipoData.estado_operativo || 'Operativo',
            observaciones: equipoData.observaciones,
            created_by: equipoData.created_by
        }])
        .select()
        .single();
    
    if (error) throw new Error(error.message);
    return data;
}

export async function actualizarEquipo(id, equipoData) {
    const { data, error } = await supabase
        .from('activos_equipos')
        .update({
            nombre: equipoData.nombre,
            marca: equipoData.marca,
            modelo: equipoData.modelo,
            sede_id: equipoData.sede_id,
            estado_operativo: equipoData.estado_operativo,
            observaciones: equipoData.observaciones
        })
        .eq('id', id)
        .select()
        .single();
    
    if (error) throw new Error(error.message);
    return data;
}

export async function actualizarEstadoEquipo(equipoId, estado) {
    const { error } = await supabase
        .from('activos_equipos')
        .update({ estado_operativo: estado })
        .eq('id', equipoId);
    
    if (error) throw new Error(error.message);
}

export async function fetchIntervenciones(equipoId) {
    const { data, error } = await supabase
        .from('activos_intervenciones')
        .select('*')
        .eq('equipo_id', equipoId)
        .order('fecha_intervencion', { ascending: false })
        .order('created_at', { ascending: false });
    
    if (error) throw new Error(error.message);
    return data;
}

export async function registrarIntervencion(intervencionData, file = null) {
    let doc_url = null;
    
    // Subir archivo a Storage si existe
    if (file) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `${intervencionData.equipo_id}/${fileName}`;
        
        const { error: uploadError } = await supabase.storage
            .from('activos_documentos')
            .upload(filePath, file);
        
        if (uploadError) {
            throw new Error('Error al subir el archivo: ' + uploadError.message);
        }
        
        // Obtener la URL pública
        const { data: publicUrlData } = supabase.storage
            .from('activos_documentos')
            .getPublicUrl(filePath);
            
        doc_url = publicUrlData.publicUrl;
    }

    // Insertar la intervención
    const { data, error } = await supabase
        .from('activos_intervenciones')
        .insert([{
            equipo_id: intervencionData.equipo_id,
            tipo_tarea: intervencionData.tipo_tarea,
            responsable: intervencionData.responsable,
            fecha_intervencion: intervencionData.fecha_intervencion || new Date().toISOString(),
            proximo_mantenimiento: intervencionData.proximo_mantenimiento,
            estado_post: intervencionData.estado_post,
            notas: intervencionData.notas,
            doc_url: doc_url,
            created_by: intervencionData.created_by
        }])
        .select()
        .single();
    
    if (error) throw new Error(error.message);
    
    // Actualizar el estado del equipo
    if (intervencionData.estado_post) {
        await actualizarEstadoEquipo(intervencionData.equipo_id, intervencionData.estado_post);
    }
    
    return data;
}
