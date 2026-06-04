/**
 * documentosService.js — Servicio para gestión de documentos centralizados
 * Upload/Download/Delete usando Supabase Storage + tabla de metadatos
 */

import { supabase } from '../lib/supabase';
import { v4 as uuidv4 } from 'uuid';

/**
 * Extensiones y MIME types aceptados
 */
export const ACCEPTED_EXTENSIONS = {
    'image/jpeg': ['.jpg', '.jpeg'],
    'image/png': ['.png'],
    'application/pdf': ['.pdf'],
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
    'application/vnd.ms-excel': ['.xls'],
    'application/msword': ['.doc'],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
    'application/vnd.ms-powerpoint': ['.ppt'],
};

export const ACCEPT_STRING = Object.entries(ACCEPTED_EXTENSIONS)
    .flatMap(([mime, exts]) => [mime, ...exts])
    .join(',');

/** Max file size: 50MB */
export const MAX_FILE_SIZE = 50 * 1024 * 1024;

/**
 * Sube un documento al bucket y registra sus metadatos
 */
export async function uploadDocumento(file, categoria = 'General', descripcion = '', usuario = 'sistema') {
    if (file.size > MAX_FILE_SIZE) {
        throw new Error(`El archivo excede el límite de 50MB (${(file.size / 1024 / 1024).toFixed(1)}MB)`);
    }

    // Generate unique storage key preserving extension
    const ext = file.name.includes('.') ? '.' + file.name.split('.').pop().toLowerCase() : '';
    const storageKey = `${uuidv4()}${ext}`;

    // 1. Upload to Storage bucket
    const { error: uploadError } = await supabase.storage
        .from('documentos')
        .upload(storageKey, file, {
            cacheControl: '3600',
            upsert: false,
            contentType: file.type,
        });

    if (uploadError) throw new Error(`Error al subir archivo: ${uploadError.message}`);

    // 2. Insert metadata row
    const { data, error: metaError } = await supabase
        .from('documentos')
        .insert({
            nombre_original: file.name,
            nombre_storage: storageKey,
            mime_type: file.type || 'application/octet-stream',
            size_bytes: file.size,
            categoria: categoria.trim() || 'General',
            descripcion: descripcion.trim() || null,
            subido_por: usuario,
        })
        .select()
        .single();

    if (metaError) {
        // Rollback: delete the uploaded file
        await supabase.storage.from('documentos').remove([storageKey]);
        throw new Error(`Error al guardar metadatos: ${metaError.message}`);
    }

    return data;
}

/**
 * Lista documentos con filtros opcionales
 */
export async function fetchDocumentos({ search = '', categoria = '' } = {}) {
    let query = supabase
        .from('documentos')
        .select('*')
        .order('created_at', { ascending: false });

    if (categoria) {
        query = query.eq('categoria', categoria);
    }

    if (search) {
        query = query.or(
            `nombre_original.ilike.%${search}%,descripcion.ilike.%${search}%,subido_por.ilike.%${search}%`
        );
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
}

/**
 * Elimina un documento del bucket y de la tabla de metadatos
 */
export async function deleteDocumento(id, storageKey) {
    // 1. Delete from Storage
    const { error: storageError } = await supabase.storage
        .from('documentos')
        .remove([storageKey]);

    if (storageError) {
        console.warn('Error deleting from storage:', storageError);
    }

    // 2. Delete metadata
    const { error: metaError } = await supabase
        .from('documentos')
        .delete()
        .eq('id', id);

    if (metaError) throw metaError;
}

/**
 * Obtiene la URL pública de un archivo en el bucket
 */
export function getDocumentoPublicUrl(storageKey) {
    const { data } = supabase.storage
        .from('documentos')
        .getPublicUrl(storageKey);

    return data?.publicUrl || '';
}

/**
 * Lista las categorías únicas existentes
 */
export async function getCategorias() {
    const { data, error } = await supabase
        .from('documentos')
        .select('categoria')
        .order('categoria');

    if (error) throw error;

    const unique = [...new Set((data || []).map(d => d.categoria).filter(Boolean))];
    return unique;
}
