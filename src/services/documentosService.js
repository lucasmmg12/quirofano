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
        const safeSearch = search.replace(/,/g, ' ').trim();
        query = query.or(
            `nombre_original.ilike.%${safeSearch}%,descripcion.ilike.%${safeSearch}%,subido_por.ilike.%${safeSearch}%`
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
    // Primero intentamos obtener de la tabla dedicada
    const { data: catRows, error: catError } = await supabase
        .from('documento_categorias')
        .select('nombre, color, orden')
        .order('orden', { ascending: true });

    if (!catError && catRows && catRows.length > 0) {
        return catRows;
    }

    // Fallback: obtener de los documentos directamente
    const { data, error } = await supabase
        .from('documentos')
        .select('categoria')
        .order('categoria');

    if (error) throw error;

    const unique = [...new Set((data || []).map(d => d.categoria).filter(Boolean))];
    return unique.map((name, i) => ({ nombre: name, color: null, orden: i }));
}

/**
 * Crea una nueva categoría
 */
export async function createCategoria(nombre, color = null) {
    if (!nombre?.trim()) throw new Error('El nombre es obligatorio');

    // Get max orden
    const { data: maxRow } = await supabase
        .from('documento_categorias')
        .select('orden')
        .order('orden', { ascending: false })
        .limit(1)
        .maybeSingle();

    const nextOrden = (maxRow?.orden || 0) + 1;

    const { data, error } = await supabase
        .from('documento_categorias')
        .insert({ nombre: nombre.trim(), color: color || null, orden: nextOrden })
        .select()
        .single();

    if (error) throw new Error(error.message);
    return data;
}

/**
 * Renombra una categoría (actualiza nombre en categorías y en todos los documentos)
 */
export async function renameCategoria(oldName, newName) {
    if (!newName?.trim()) throw new Error('El nuevo nombre es obligatorio');

    // Update category table
    await supabase
        .from('documento_categorias')
        .update({ nombre: newName.trim() })
        .eq('nombre', oldName);

    // Update all documents with old category
    const { error } = await supabase
        .from('documentos')
        .update({ categoria: newName.trim() })
        .eq('categoria', oldName);

    if (error) throw new Error(error.message);
}

/**
 * Elimina una categoría (mover docs a "General" primero)
 */
export async function deleteCategoria(nombre) {
    // Move documents to "General"
    await supabase
        .from('documentos')
        .update({ categoria: 'General' })
        .eq('categoria', nombre);

    // Delete from categories table
    await supabase
        .from('documento_categorias')
        .delete()
        .eq('nombre', nombre);
}

/**
 * Actualiza la categoría de un documento (para drag & drop)
 */
export async function updateDocumentoCategoria(docId, newCategoria) {
    const { data, error } = await supabase
        .from('documentos')
        .update({ categoria: newCategoria })
        .eq('id', docId)
        .select()
        .single();

    if (error) throw new Error(error.message);
    return data;
}

/**
 * Actualiza la categoría de múltiples documentos a la vez
 */
export async function bulkUpdateCategoria(docIds, newCategoria) {
    const { error } = await supabase
        .from('documentos')
        .update({ categoria: newCategoria })
        .in('id', docIds);

    if (error) throw new Error(error.message);
}

