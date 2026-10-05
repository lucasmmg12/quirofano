/**
 * salusSync.js — Servicio de sincronización unificado con SALUS
 * 
 * Soporta dos vías automáticas y transparentes:
 *  1. Vía Directa (HTTP en LAN / localhost si estamos en http: o dev server)
 *  2. Vía Universal / Cloud (mediante Supabase y colas salus_sync_requests)
 *     para entornos HTTPS como Vercel o cualquier computadora conectada a Internet,
 *     eliminando problemas de Mixed Content y sin necesidad de ejecutar archivos .bat.
 */

import { supabase } from '../lib/supabase';

export function isLocalEnvironment() {
    if (typeof window === 'undefined') return true;
    const host = window.location.hostname;
    return host === 'localhost' || host === '127.0.0.1';
}

export function getSalusSyncBaseUrl() {
    if (typeof window === 'undefined') return 'http://localhost:3456';
    // Si la app está en HTTPS, no podemos hacer llamadas HTTP directas por política de Mixed Content
    if (window.location.protocol === 'https:') {
        return null;
    }
    const host = window.location.hostname;
    const isLocal = host === 'localhost' || host === '127.0.0.1';
    if (window.location.port === '5173' && isLocal) {
        return window.location.origin;
    }
    if (isLocal) {
        return 'http://localhost:3456';
    }
    // En la red intranet del Sanatorio Argentino (128.223.x.x o red local) conectarse al sync-server central
    return 'http://128.223.17.60:3456';
}

/**
 * Verifica si el sync-server central de Sanatorio Argentino está online y operativo
 */
export async function checkSalusHealth() {
    const isLocal = isLocalEnvironment();

    // 1. Probar llamada directa HTTP SOLO si estamos en la propia máquina local (localhost)
    if (isLocal && typeof window !== 'undefined' && window.location.protocol !== 'https:') {
        try {
            const res = await fetch('http://localhost:3456/api/salus/health', { signal: AbortSignal.timeout(1000) });
            if (res.ok) {
                const data = await res.json();
                if (data.success && data.connected) {
                    return { available: true, directUrl: 'http://localhost:3456/api/salus', ...data };
                }
            }
        } catch (_) {}
    }

    // 2. Probar estado central en Supabase (funciona para el 100% de PCs externas, intranet, HTTPS y Vercel)
    try {
        const { data, error } = await supabase
            .from('salus_sync_server_status')
            .select('*')
            .eq('id', 'primary')
            .single();

        if (!error && data && data.online) {
            // Tolerancia de 15 minutos con Math.abs para cubrir desfasajes horarios de relojes de Windows
            const diffMinutes = Math.abs(Date.now() - new Date(data.last_seen).getTime()) / 60000;
            if (diffMinutes < 15) {
                return {
                    available: true,
                    viaCloud: true,
                    serverIp: data.server_ip || '128.223.17.60',
                    sqlConnected: data.sql_server_connected,
                    lastSeen: data.last_seen,
                    currentTask: data.current_task,
                };
            }
        }
    } catch (e) {
        console.warn('[salusSync] Error consultando estado en Supabase:', e);
    }

    return { available: false, error: 'Sync server no disponible' };
}

/**
 * Dispara la sincronización integral (rápida o completa) de forma transparente
 */
export async function triggerSalusSync({ isFast = true, requestedBy = 'Usuario', onProgress = null } = {}) {
    const isLocal = isLocalEnvironment();

    // 1. Intento directo SOLO si estamos en localhost
    if (isLocal && typeof window !== 'undefined' && window.location.protocol !== 'https:') {
        try {
            const hRes = await fetch('http://localhost:3456/api/salus/health', { signal: AbortSignal.timeout(1000) });
            if (hRes.ok) {
                const endpoint = `http://localhost:3456/api/salus/sync-all${isFast ? '?fast=true' : ''}`;
                const timeoutMs = isFast ? 600000 : 1800000;
                const res = await fetch(endpoint, { signal: AbortSignal.timeout(timeoutMs) });
                const json = await res.json();
                if (json.success) return json;
                throw new Error(json.error || 'Error en sync directo');
            }
        } catch (_) {}
    }

    // 2. Vía Universal Supabase: cola salus_sync_requests (para PCs externas o modo cloud)
    const { data: request, error: reqErr } = await supabase
        .from('salus_sync_requests')
        .insert({
            mode: isFast ? 'fast' : 'full',
            status: 'pending',
            requested_by: requestedBy,
            requested_at: new Date().toISOString()
        })
        .select()
        .single();

    if (reqErr || !request) {
        throw new Error(reqErr?.message || 'No se pudo crear la solicitud de sincronización en Supabase.');
    }

    // Esperar a que el sync-server procese la solicitud (hasta 15 minutos para tolerar filas en progreso)
    const maxWaitMs = isFast ? 900000 : 2400000;
    const startWait = Date.now();

    while (Date.now() - startWait < maxWaitMs) {
        await new Promise(r => setTimeout(r, 2000));

        // Consultar estado de la solicitud y progreso del servidor
        const [reqRes, statusRes] = await Promise.all([
            supabase.from('salus_sync_requests').select('*').eq('id', request.id).single(),
            supabase.from('salus_sync_server_status').select('current_task').eq('id', 'primary').single()
        ]);

        if (statusRes?.data?.current_task && onProgress) {
            onProgress(statusRes.data.current_task);
        }

        const reqState = reqRes?.data;
        if (reqState) {
            if (reqState.status === 'completed') {
                return {
                    success: true,
                    elapsed: reqState.elapsed,
                    results: reqState.results,
                    timestamp: reqState.completed_at
                };
            }
            if (reqState.status === 'error') {
                throw new Error(reqState.error || 'Error durante la sincronización');
            }
        }
    }

    throw new Error('La sincronización está demorando más de lo esperado. Continuará procesándose en el servidor central.');
}

/**
 * Ejecuta sincronización completa (legacy compatibility)
 */
export async function syncAll() {
    return triggerSalusSync({ isFast: false });
}

/**
 * Sincroniza el padrón maestro de pacientes desde SALUS hacia hospital_pacientes
 * Soporta ejecución en LAN local y vía cola Cloud para PCs externas
 */
export async function syncPacientes(options = {}) {
    const isLocal = isLocalEnvironment();

    if (isLocal && typeof window !== 'undefined' && window.location.protocol !== 'https:') {
        try {
            const params = new URLSearchParams();
            if (options.days) params.append('days', options.days);
            if (options.from) params.append('from', options.from);
            if (options.all) params.append('all', 'true');
            if (options.fast) params.append('fast', 'true');

            const qs = params.toString() ? `?${params.toString()}` : '';
            const res = await fetch(`http://localhost:3456/api/salus/sync/pacientes${qs}`, { signal: AbortSignal.timeout(300000) });
            if (res.ok) {
                return await res.json();
            }
        } catch (_) {}
    }

    // Vía Universal Cloud para PCs externas
    const { data: request, error: reqErr } = await supabase
        .from('salus_sync_requests')
        .insert({
            mode: 'pacientes',
            status: 'pending',
            requested_by: options.requestedBy || 'Usuario',
            requested_at: new Date().toISOString()
        })
        .select()
        .single();

    if (reqErr || !request) {
        throw new Error(reqErr?.message || 'No se pudo crear la solicitud de sincronización de pacientes.');
    }

    const maxWaitMs = 300000;
    const startWait = Date.now();

    while (Date.now() - startWait < maxWaitMs) {
        await new Promise(r => setTimeout(r, 2000));
        const { data: reqState } = await supabase
            .from('salus_sync_requests')
            .select('*')
            .eq('id', request.id)
            .single();

        if (reqState) {
            if (reqState.status === 'completed') {
                return { success: true, results: reqState.results };
            }
            if (reqState.status === 'error') {
                throw new Error(reqState.error || 'Error al sincronizar pacientes');
            }
        }
    }

    throw new Error('La sincronización de pacientes está demorando. Continúa procesándose en el servidor central.');
}

/**
 * Busca y sincroniza un paciente individual desde SALUS a Supabase en tiempo real
 */
export async function syncPacienteIndividual(ident) {
    const clean = String(ident || '').trim();
    if (!clean) throw new Error('Identificador requerido');

    // 1. Probar en Supabase primero (rápido y universal)
    const cleanDni = clean.replace(/\D/g, '');
    if (cleanDni.length >= 5) {
        const { data: pCached } = await supabase
            .from('hospital_pacientes')
            .select('*')
            .eq('dni', cleanDni)
            .limit(1)
            .maybeSingle();

        if (pCached) {
            return { success: true, paciente: pCached };
        }
    }

    // 2. Si estamos en localhost, probar sync server local
    const isLocal = isLocalEnvironment();
    if (isLocal && typeof window !== 'undefined' && window.location.protocol !== 'https:') {
        try {
            const res = await fetch(`http://localhost:3456/api/salus/sync/paciente/${encodeURIComponent(clean)}`, { signal: AbortSignal.timeout(10000) });
            if (res.ok) {
                return await res.json();
            }
        } catch (_) {}
    }

    return { success: true, paciente: null };
}
