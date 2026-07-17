import { createClient } from '@supabase/supabase-js';

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const supabaseServiceRoleKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('⚠️ Supabase URL o Anon Key no configuradas en .env');
}

// Genera un proxy encadenable para simular el cliente de supabase y evitar crashes (ej: .from().select())
const createMockChain = () => {
    const chain = new Proxy(() => {}, {
        get: (target, prop) => {
            if (prop === 'then') {
                return (resolve) => resolve({ data: null, error: { message: 'Supabase no configurado en este entorno' } });
            }
            return chain;
        },
        apply: () => chain
    });
    return chain;
};

export const supabase = supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : new Proxy({}, { get: () => createMockChain() });

export const supabaseAdmin = supabaseServiceRoleKey && supabaseUrl
    ? createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false }
    })
    : supabase;
