/**
 * Shortcut Service — Atajos de mensajes rápidos para WhatsApp
 * Maneja la lectura de shortcuts desde whatsapp_shortcuts
 */

import { supabase } from '../lib/supabase';

// Cache local para evitar queries repetidos en la misma sesión
let cachedShortcuts = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

/**
 * Obtiene todos los atajos activos, ordenados por sort_order
 * Usa cache local para evitar queries repetidos
 */
export async function fetchShortcuts(forceRefresh = false) {
    const now = Date.now();

    // Devolver cache si es válido
    if (!forceRefresh && cachedShortcuts && (now - cacheTimestamp) < CACHE_TTL) {
        return cachedShortcuts;
    }

    const { data, error } = await supabase
        .from('whatsapp_shortcuts')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('label', { ascending: true });

    if (error) {
        console.error('Error fetching shortcuts:', error);
        // Si hay cache viejo, devolverlo como fallback
        if (cachedShortcuts) return cachedShortcuts;
        throw error;
    }

    cachedShortcuts = data || [];
    cacheTimestamp = now;
    return cachedShortcuts;
}

/**
 * Invalida el cache (útil después de editar shortcuts)
 */
export function invalidateShortcutCache() {
    cachedShortcuts = null;
    cacheTimestamp = 0;
}

/**
 * Obtiene TODOS los atajos (activos e inactivos) para administración
 */
export async function fetchAllShortcuts() {
    const { data, error } = await supabase
        .from('whatsapp_shortcuts')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('label', { ascending: true });

    if (error) {
        console.error('Error fetching all shortcuts:', error);
        throw error;
    }
    return data || [];
}

/**
 * Crea un nuevo atajo
 */
export async function createShortcut({ shortcut, label, message, category }) {
    const { data, error } = await supabase
        .from('whatsapp_shortcuts')
        .insert([{ shortcut, label, message, category, is_active: true }])
        .select()
        .single();

    if (error) {
        console.error('Error creating shortcut:', error);
        throw error;
    }
    invalidateShortcutCache();
    return data;
}

/**
 * Actualiza un atajo existente
 */
export async function updateShortcut(id, updates) {
    const { data, error } = await supabase
        .from('whatsapp_shortcuts')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

    if (error) {
        console.error('Error updating shortcut:', error);
        throw error;
    }
    invalidateShortcutCache();
    return data;
}

/**
 * Elimina un atajo (hard delete)
 */
export async function deleteShortcut(id) {
    const { error } = await supabase
        .from('whatsapp_shortcuts')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Error deleting shortcut:', error);
        throw error;
    }
    invalidateShortcutCache();
}
