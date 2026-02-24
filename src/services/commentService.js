/**
 * Comment Service — Comentarios internos de cirugía
 * CRUD para seguimiento de pacientes
 */
import { supabase } from '../lib/supabase';

/**
 * Obtiene comentarios de una cirugía, ordenados por fecha desc
 */
export async function fetchComments(surgeryId) {
    const { data, error } = await supabase
        .from('surgery_comments')
        .select('*')
        .eq('surgery_id', surgeryId)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching comments:', error);
        throw error;
    }
    return data || [];
}

/**
 * Agrega un comentario interno
 */
export async function addComment(surgeryId, userName, comment) {
    const { data, error } = await supabase
        .from('surgery_comments')
        .insert([{
            surgery_id: surgeryId,
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
