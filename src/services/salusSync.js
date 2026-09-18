/**
 * salusSync.js — Servicio de sincronización con SALUS
 * 
 * El sync-server (localhost:3456) hace todo el trabajo pesado.
 * Este servicio solo verifica disponibilidad y dispara la sincronización.
 */

const SYNC_BASE_URL = import.meta.env.VITE_SALUS_SYNC_URL || 'http://127.0.0.1:3456/api/salus';

/**
 * Verifica si el sync-server está corriendo y conectado a SALUS
 */
export async function checkSalusHealth() {
    try {
        const res = await fetch(`${SYNC_BASE_URL}/health`, { signal: AbortSignal.timeout(5000) });
        if (!res.ok) return { available: false, error: `HTTP ${res.status}` };
        const data = await res.json();
        return { available: data.success && data.connected, ...data };
    } catch {
        return { available: false, error: 'Sync server no disponible' };
    }
}

/**
 * Ejecuta sincronización completa (cirugías + presupuestos + deudas)
 */
export async function syncAll() {
    const res = await fetch(`${SYNC_BASE_URL}/sync-all`, { signal: AbortSignal.timeout(300000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

/**
 * Sincroniza el padrón maestro de pacientes desde SALUS hacia hospital_pacientes
 * @param {Object} options { days, from, all, fast }
 */
export async function syncPacientes(options = {}) {
    const params = new URLSearchParams();
    if (options.days) params.append('days', options.days);
    if (options.from) params.append('from', options.from);
    if (options.all) params.append('all', 'true');
    if (options.fast) params.append('fast', 'true');

    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await fetch(`${SYNC_BASE_URL}/sync/pacientes${qs}`, { signal: AbortSignal.timeout(300000) });
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
    const clean = String(ident || '').trim();
    if (!clean) throw new Error('Identificador requerido');
    const res = await fetch(`${SYNC_BASE_URL}/sync/paciente/${encodeURIComponent(clean)}`, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
    }
    return res.json();
}
