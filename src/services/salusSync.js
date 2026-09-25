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

export function getSalusSyncBaseUrl() {
    if (typeof window === 'undefined') return 'http://localhost:3456';
    if (import.meta.env.VITE_SALUS_SYNC_URL) {
        return import.meta.env.VITE_SALUS_SYNC_URL.replace(/\/api\/salus\/?$/, '');
    }
    // Si la app está en HTTPS, no podemos hacer llamadas HTTP directas por política de Mixed Content
    if (window.location.protocol === 'https:') {
        return null;
    }
    const host = window.location.hostname;
    const isLocal = host === 'localhost' || host === '127.0.0.1';
    if (window.location.port === '5173') {
        return window.location.origin;
    }
    if (isLocal) {
        return 'http://localhost:3456';
    }
    return 'http://128.223.17.60:3456';
}

/**
 * Verifica si el sync-server central de Sanatorio Argentino está online y operativo
 */
export async function checkSalusHealth() {
    // 1. Probar llamada directa HTTP si el navegador está en HTTP
    if (typeof window !== 'undefined' && window.location.protocol !== 'https:') {
        const localCandidates = [
            'http://localhost:3456/api/salus',
            'http://128.223.17.60:3456/api/salus'
        ];
        for (const base of localCandidates) {
            try {
                const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(1500) });
                if (res.ok) {
                    const data = await res.json();
                    if (data.success && data.connected) {
                        return { available: true, directUrl: base, ...data };
                    }
                }
            } catch (_) {}
        }
    }

    // 2. Probar estado central en Supabase (funciona en HTTPS, Vercel y cualquier computadora)
    try {
        const { data, error } = await supabase
            .from('salus_sync_server_status')
            .select('*')
            .eq('id', 'primary')
            .single();

        if (!error && data && data.online) {
            const diffSeconds = (Date.now() - new Date(data.last_seen).getTime()) / 1000;
            // Si el servidor emitió latido en los últimos 3 minutos (180s)
            if (diffSeconds < 180) {
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
export async function triggerSalusSync({ isFast = true, requestedBy = 'Usuario' } = {}) {
    // 1. Intentar vía directa HTTP si estamos en HTTP
    if (typeof window !== 'undefined' && window.location.protocol !== 'https:') {
        const localCandidates = [
            'http://localhost:3456/api/salus',
            'http://128.223.17.60:3456/api/salus'
        ];
        for (const base of localCandidates) {
            try {
                const hRes = await fetch(`${base}/health`, { signal: AbortSignal.timeout(1000) });
                if (hRes.ok) {
                    const endpoint = `${base}/sync-all${isFast ? '?fast=true' : ''}`;
                    const timeoutMs = isFast ? 300000 : 1800000;
                    const res = await fetch(endpoint, { signal: AbortSignal.timeout(timeoutMs) });
                    const json = await res.json();
                    if (json.success) return json;
                    throw new Error(json.error || 'Error en sync directo');
                }
            } catch (_) {}
        }
    }

    // 2. Vía Universal Supabase: cola salus_sync_requests
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

    // Esperar a que el sync-server procese la solicitud
    const maxWaitMs = isFast ? 300000 : 1800000;
    const startWait = Date.now();

    while (Date.now() - startWait < maxWaitMs) {
        await new Promise(r => setTimeout(r, 2000));
        const { data: reqState, error: stateErr } = await supabase
            .from('salus_sync_requests')
            .select('*')
            .eq('id', request.id)
            .single();

        if (stateErr) continue;

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

    throw new Error('La sincronización está demorando más de lo esperado. Continuará procesándose en el servidor.');
}

/**
 * Ejecuta sincronización completa (legacy compatibility)
 */
export async function syncAll() {
    return triggerSalusSync({ isFast: false });
}

/**
 * Sincroniza el padrón maestro de pacientes desde SALUS hacia hospital_pacientes
 */
export async function syncPacientes(options = {}) {
    const baseUrl = getSalusSyncBaseUrl() || 'http://128.223.17.60:3456';
    const params = new URLSearchParams();
    if (options.days) params.append('days', options.days);
    if (options.from) params.append('from', options.from);
    if (options.all) params.append('all', 'true');
    if (options.fast) params.append('fast', 'true');

    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await fetch(`${baseUrl}/api/salus/sync/pacientes${qs}`, { signal: AbortSignal.timeout(300000) });
    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
    }
    return res.json();
}

/**
 * Busca y sincroniza un paciente individual desde SALUS a Supabase en tiempo real
 */
export async function syncPacienteIndividual(ident) {
    const baseUrl = getSalusSyncBaseUrl() || 'http://128.223.17.60:3456';
    const clean = String(ident || '').trim();
    if (!clean) throw new Error('Identificador requerido');
    const res = await fetch(`${baseUrl}/api/salus/sync/paciente/${encodeURIComponent(clean)}`, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
    }
    return res.json();
}
