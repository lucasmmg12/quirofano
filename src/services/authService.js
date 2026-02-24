/**
 * Servicio de Autenticación
 * 
 * Login/logout con verificación de password via Supabase RPC (pgcrypto).
 * Sesión persistida en localStorage.
 * Máximo ~10 usuarios, todos con mismo rol.
 */
import { supabase } from '../lib/supabase';

const SESSION_KEY = 'admqui_session';

// =============================================
// SESSION MANAGEMENT
// =============================================

/**
 * Obtiene el usuario actual de localStorage
 * @returns {{ id: string, usuario: string, nombre: string, iniciales: string } | null}
 */
export function getCurrentUser() {
    try {
        const raw = localStorage.getItem(SESSION_KEY);
        if (!raw) return null;
        const session = JSON.parse(raw);
        // Validar que tiene los campos mínimos
        if (!session?.id || !session?.usuario) return null;
        return session;
    } catch {
        return null;
    }
}

/**
 * Verifica si hay un usuario logueado
 */
export function isAuthenticated() {
    return getCurrentUser() !== null;
}


// =============================================
// LOGIN / LOGOUT
// =============================================

/**
 * Intenta login con usuario y contraseña
 * @param {string} usuario
 * @param {string} password
 * @returns {{ success: boolean, user?: object, error?: string }}
 */
export async function login(usuario, password) {
    if (!usuario || !password) {
        return { success: false, error: 'Usuario y contraseña son requeridos' };
    }

    try {
        const { data, error } = await supabase.rpc('verify_login', {
            p_usuario: usuario.trim().toLowerCase(),
            p_password: password,
        });

        if (error) {
            console.error('[AuthService] RPC error:', error);
            return { success: false, error: 'Error de conexión. Intente nuevamente.' };
        }

        if (!data || data.length === 0) {
            return { success: false, error: 'Usuario o contraseña incorrectos' };
        }

        const user = data[0];
        const session = {
            id: user.id,
            usuario: user.usuario,
            nombre: user.nombre,
            iniciales: user.iniciales || user.nombre.charAt(0).toUpperCase(),
            loginAt: new Date().toISOString(),
        };

        localStorage.setItem(SESSION_KEY, JSON.stringify(session));

        return { success: true, user: session };
    } catch (err) {
        console.error('[AuthService] Login error:', err);
        return { success: false, error: 'Error inesperado: ' + err.message };
    }
}

/**
 * Cierra la sesión del usuario
 */
export function logout() {
    localStorage.removeItem(SESSION_KEY);
}


// =============================================
// USER MANAGEMENT (Admin)
// =============================================

/**
 * Crea un nuevo usuario (solo admin)
 */
export async function createUser(usuario, nombre, password, iniciales = null) {
    const { data, error } = await supabase.rpc('create_user', {
        p_usuario: usuario,
        p_nombre: nombre,
        p_password: password,
        p_iniciales: iniciales,
    });

    if (error) {
        if (error.message?.includes('duplicate') || error.message?.includes('uq_usuarios')) {
            throw new Error(`El usuario "${usuario}" ya existe`);
        }
        throw new Error(error.message);
    }

    return data;
}

/**
 * Lista todos los usuarios
 */
export async function listUsers() {
    const { data, error } = await supabase
        .from('usuarios')
        .select('id, usuario, nombre, iniciales, activo, ultimo_login, created_at')
        .order('nombre');

    if (error) throw new Error(error.message);
    return data || [];
}

/**
 * Desactiva/activa un usuario
 */
export async function toggleUserActive(userId, activo) {
    const { error } = await supabase
        .from('usuarios')
        .update({ activo })
        .eq('id', userId);

    if (error) throw new Error(error.message);
}
