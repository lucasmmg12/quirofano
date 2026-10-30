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

export const supabase = supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : new Proxy({}, { get: () => createMockChain() });

// Por seguridad (C-03), jamás exponer service_role_key en el bundle del navegador
export const supabaseAdmin = supabase;
