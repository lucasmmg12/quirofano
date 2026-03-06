/**
 * Comment Service — Comentarios internos de cirugía
 * CRUD para seguimiento de pacientes
 * 
 * IMPORTANTE: Los comentarios se vinculan por id_paciente (inmutable)
 * para que sobrevivan a re-importaciones de Excel.
 * Se mantiene surgery_id como referencia secundaria.
 */
import { supabase } from '../lib/supabase';

/**
 * Obtiene comentarios de un paciente por su id_paciente.
 * Si no tiene id_paciente, fallback a surgery_id (registros legacy).
 * @param {string} idPaciente - ID del paciente del sistema fuente
 * @param {string} [surgeryId] - UUID fallback (para registros sin id_paciente)
 */
export async function fetchComments(idPaciente, surgeryId) {
    // Estrategia: buscar por id_paciente (preferido) o surgery_id (fallback)
    if (idPaciente) {
        const { data, error } = await supabase
            .from('surgery_comments')
            .select('*')
            .eq('id_paciente', idPaciente)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching comments by id_paciente:', error);
            throw error;
        }
        return data || [];
    }

    // Fallback: buscar por surgery_id (registros sin id_paciente)
    if (surgeryId) {
        const { data, error } = await supabase
            .from('surgery_comments')
            .select('*')
            .eq('surgery_id', surgeryId)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching comments by surgery_id:', error);
            throw error;
        }
        return data || [];
    }

    return [];
}

/**
 * Agrega un comentario interno vinculado por id_paciente.
 * @param {string} surgeryId - UUID de la cirugía actual (referencia)
 * @param {string} idPaciente - ID del paciente (vínculo permanente)
 * @param {string} userName - Nombre del usuario que comenta
 * @param {string} comment - Texto del comentario
 */
export async function addComment(surgeryId, idPaciente, userName, comment) {
    const { data, error } = await supabase
        .from('surgery_comments')
        .insert([{
            surgery_id: surgeryId,
            id_paciente: idPaciente || null,
            user_name: userName,
            comment: comment.trim(),
        }])
        .select()
        .single();

    if (error) {
        console.error('Error adding comment:', error);
        throw error;
    }
    return data;
}

/**
 * Elimina un comentario
 */
export async function deleteComment(id) {
    const { error } = await supabase
        .from('surgery_comments')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Error deleting comment:', error);
        throw error;
    }
}

/**
 * Actualiza el texto de un comentario
 */
export async function updateComment(id, newComment) {
    const { data, error } = await supabase
        .from('surgery_comments')
        .update({ comment: newComment.trim() })
        .eq('id', id)
        .select()
        .single();

    if (error) {
        console.error('Error updating comment:', error);
        throw error;
    }
    return data;
}
