import { createClient } from '@supabase/supabase-js';

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('⚠️ Supabase URL o Anon Key no configuradas en .env');
}

// Genera un proxy encadenable para simular el cliente de supabase y evitar crashes (ej: .from().select())
const createMockChain = () => {
    const mockPromise = Promise.resolve({ data: null, error: { message: 'Supabase no configurado en este entorno' } });
    const chain = new Proxy(() => {}, {
        get: (target, prop) => {
            if (prop === 'then') return mockPromise.then.bind(mockPromise);
            if (prop === 'catch') return mockPromise.catch.bind(mockPromise);
            if (prop === 'finally') return mockPromise.finally.bind(mockPromise);
            return chain;
        },
        apply: () => chain
    });
    return chain;
};

// Interceptor de seguridad y resiliencia de red para adjuntar x-session-token / x-device-token
// y reintentar automáticamente ante caídas transitorias de socket (ERR_CONNECTION_TIMED_OUT)
const secureFetch = async (url, options = {}) => {
    const urlStr = typeof url === 'string' ? url : String(url?.url || '');
    const isRestOrRpc = typeof window !== 'undefined' && urlStr.includes('/rest/v1/');
    const method = String(options.method || 'GET').toUpperCase();
    const isRead = method === 'GET' || method === 'HEAD';

    let finalOptions = options;
    if (isRestOrRpc) {
        try {
            const headers = new Headers(options.headers || {});
            const rawSession = window.localStorage?.getItem('admqui_session') || window.sessionStorage?.getItem('admqui_session');
            const deviceToken = window.localStorage?.getItem('admqui_trusted_device_token') || '';
            let sessionToken = '';
            if (rawSession) {
                try {
                    const parsed = JSON.parse(rawSession);
                    sessionToken = parsed?.sessionToken || parsed?.active_session_token || '';
                } catch {
                    // ignore JSON parse error
                }
            }
            if (sessionToken) {
                headers.set('x-session-token', sessionToken);
            }
            if (deviceToken) {
                headers.set('x-device-token', deviceToken);
            }
            finalOptions = { ...options, headers };
        } catch {
            finalOptions = options;
        }
    }

    const maxRetries = isRead ? 2 : 1;
    const timeoutMs = isRead ? 9000 : 14000;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const controller = !finalOptions.signal && typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

        try {
            const reqOptions = controller ? { ...finalOptions, signal: controller.signal } : finalOptions;
            const response = await fetch(url, reqOptions);
            if (timer) clearTimeout(timer);
            return response;
        } catch (err) {
            if (timer) clearTimeout(timer);
            const isLastAttempt = attempt >= maxRetries;
            if (isLastAttempt || finalOptions.signal?.aborted) {
                throw err;
            }
            // Backoff breve antes de reintentar en un nuevo socket TCP
            await new Promise(r => setTimeout(r, 350 * (attempt + 1)));
        }
    }

    return fetch(url, finalOptions);
};

export const supabase = supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
        },
        global: {
            fetch: secureFetch,
        },
    })
    : new Proxy({}, { get: () => createMockChain() });

// Por seguridad (C-03), jamás exponer service_role_key en el bundle del navegador
export const supabaseAdmin = supabase;
