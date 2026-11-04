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

// Interceptor de seguridad para adjuntar x-session-token y x-device-token en llamadas REST/RPC a Supabase
const secureFetch = (url, options = {}) => {
    try {
        const urlStr = typeof url === 'string' ? url : String(url?.url || '');
        if (typeof window !== 'undefined' && urlStr.includes('/rest/v1/')) {
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
            return fetch(url, { ...options, headers });
        }
    } catch {
        // Fallback silencioso a fetch nativo
    }
    return fetch(url, options);
};

export const supabase = supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        global: {
            fetch: secureFetch,
        },
    })
    : new Proxy({}, { get: () => createMockChain() });

// Por seguridad (C-03), jamás exponer service_role_key en el bundle del navegador
export const supabaseAdmin = supabase;
