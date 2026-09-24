/**
 * salusSync.js — Servicio de sincronización con SALUS
 * 
 * El sync-server (localhost:3456) hace todo el trabajo pesado.
 * Este servicio solo verifica disponibilidad y dispara la sincronización.
 */

/**
 * Resuelve dinámicamente la URL base del sync-server de SALUS para que funcione en cualquier dispositivo
 * (localhost, terminales en red LAN como la máquina de Sergio Femenia, o dispositivos remotos).
 */
export function getSalusSyncBaseUrl() {
    if (typeof window === 'undefined') return 'http://localhost:3456';
    if (import.meta.env.VITE_SALUS_SYNC_URL) {
        return import.meta.env.VITE_SALUS_SYNC_URL.replace(/\/api\/salus\/?$/, '');
    }
    // Si la aplicación se carga sobre HTTPS (ej: producción en Vercel), el navegador bloquea llamadas HTTP (Mixed Content).
    // En ese caso devolvemos null para que el frontend consulte directamente la base de datos central de Supabase.
    if (window.location.protocol === 'https:') {
        return null;
    }
    const host = window.location.hostname;
    const isLocal = host === 'localhost' || host === '127.0.0.1';
    // Si estamos en Vite dev server (puerto 5173), Vite proxea /api/salus de forma transparente
    if (window.location.port === '5173') {
        return window.location.origin;
    }
    if (isLocal) {
        return 'http://localhost:3456';
    }
    // IP fija del servidor de Sync en Sanatorio Argentino (intranet LAN: 128.223.17.60)
    return 'http://128.223.17.60:3456';
}

const SYNC_BASE_URL = `${getSalusSyncBaseUrl()}/api/salus`;

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
