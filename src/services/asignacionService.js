/**
 * asignacionService.js — CRUD + matching jerárquico para criterios de asignación
 */
import { supabase } from '../lib/supabase';

// Usuarios con permiso de edición (usuario sin @dominio)
const EDIT_USERS = ['jcorrea', 'lmarinero', 'frojo'];

export function canEditAsignacion(user) {
    const u = (user?.usuario || user?.email || '').toLowerCase().split('@')[0];
    return EDIT_USERS.includes(u);
}

/**
 * Listar todas las reglas, ordenadas por prioridad descendente
 */
export async function fetchAsignaciones() {
    const { data, error } = await supabase
        .from('altas_asignacion')
        .select('*')
        .order('prioridad', { ascending: false })
        .order('obra_social')
        .order('especialidad')
        .order('proceso');
    if (error) throw error;
    return data || [];
}

/**
 * Crear o editar una regla
 */
export async function upsertAsignacion(regla, updatedBy) {
    const payload = {
        obra_social: regla.obra_social?.trim() || '',
        especialidad: regla.especialidad?.trim() || null,
        proceso: regla.proceso?.trim() || null,
        responsable: regla.responsable?.trim() || '',
        tutor: regla.tutor?.trim() || null,
        updated_by: updatedBy,
    };

    if (regla.id) {
        const { data, error } = await supabase
            .from('altas_asignacion')
            .update(payload)
            .eq('id', regla.id)
            .select()
            .single();
        if (error) throw error;
        return data;
    } else {
        const { data, error } = await supabase
            .from('altas_asignacion')
            .insert(payload)
            .select()
            .single();
        if (error) throw error;
        return data;
    }
}

/**
 * Eliminar una regla
 */
export async function deleteAsignacion(id) {
    const { error } = await supabase
        .from('altas_asignacion')
        .delete()
        .eq('id', id);
    if (error) throw error;
}

/**
 * Import masivo desde Excel (reemplaza todo)
 */
export async function importFromExcel(rows, updatedBy) {
    // 1. Borrar todo
    const { error: delError } = await supabase
        .from('altas_asignacion')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // delete all trick

    if (delError) throw delError;

    // 2. Insertar en batches de 50
    const batchSize = 50;
    let inserted = 0;
    for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize).map(r => ({
            obra_social: (r.obra_social || '').trim(),
            especialidad: (r.especialidad || '').trim() || null,
            proceso: (r.proceso || '').trim() || null,
            responsable: (r.responsable || '').trim(),
            tutor: (r.tutor || '').trim() || null,
            updated_by: updatedBy,
        })).filter(r => r.obra_social && r.responsable);

        if (batch.length > 0) {
            const { error } = await supabase
                .from('altas_asignacion')
                .insert(batch);
            if (error) throw error;
            inserted += batch.length;
        }
    }
    return { inserted };
}

/**
 * Matching jerárquico: busca el responsable/tutor para un alta
 * Prioridad: OS+Esp+Proc > OS+Esp > OS
 */
export function matchAsignacion(criterios, obraSocial, especialidad, proceso) {
    if (!obraSocial || !criterios?.length) return null;

    const osNorm = obraSocial.trim().toUpperCase();
    const espNorm = (especialidad || '').trim().toUpperCase();
    const procNorm = (proceso || '').trim().toUpperCase();

    let bestMatch = null;
    let bestPriority = 0;

    for (const c of criterios) {
        const cOS = (c.obra_social || '').trim().toUpperCase();
        const cEsp = (c.especialidad || '').trim().toUpperCase();
        const cProc = (c.proceso || '').trim().toUpperCase();

        // La OS debe coincidir siempre
        if (cOS !== osNorm) continue;

        // Prioridad 3: match OS + Especialidad + Proceso
        if (cProc && cEsp && cEsp === espNorm && cProc === procNorm) {
            if (3 > bestPriority) { bestMatch = c; bestPriority = 3; }
        }
        // Prioridad 2: match OS + Especialidad (sin proceso)
        else if (cEsp && !cProc && cEsp === espNorm) {
            if (2 > bestPriority) { bestMatch = c; bestPriority = 2; }
        }
        // Prioridad 1: match solo OS (sin especialidad ni proceso)
        else if (!cEsp && !cProc) {
            if (1 > bestPriority) { bestMatch = c; bestPriority = 1; }
        }
    }

    return bestMatch;
}
