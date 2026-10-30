/**
 * Servicio de Autenticación y Ciberseguridad Institucional
 *
 * Incluye:
 * - Login con verificación bcrypt via Supabase RPC (verify_login_v2)
 * - Cambio obligatorio de contraseña en el próximo ingreso (must_change_password)
 * - Autenticación Multifactor Híbrida (2FA):
 *     1) Código OTP de 6 dígitos por WhatsApp (vía BuilderBot Sanatorio Argentino)
 *     2) App Autenticadora TOTP RFC 6238 (Google / Microsoft Authenticator con QR)
 * - Dispositivos de confianza por 30 días (Device Trust en PC del Sanatorio)
 * - ABM administrativo de Usuarios, Roles y Seguridad
 */
import { supabase } from '../lib/supabase';
import { trackLogin, trackLogout } from '../lib/hubTracker';
import { sendWhatsAppMessage } from './builderbotApi';

const SESSION_KEY = 'admqui_session';
const DEVICE_TOKEN_KEY = 'admqui_trusted_device_token';

// =============================================
// DEVICE TRUST HELPERS (30 DÍAS)
// =============================================

export function getOrCreateDeviceToken() {
    try {
        let token = localStorage.getItem(DEVICE_TOKEN_KEY);
        if (!token || token.length < 24) {
            const arr = new Uint8Array(24);
            window.crypto.getRandomValues(arr);
            token = 'sa_dev_' + Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
            localStorage.setItem(DEVICE_TOKEN_KEY, token);
        }
        return token;
    } catch {
        return null;
    }
}

export function getDeviceLabel() {
    try {
        const ua = navigator.userAgent || '';
        const os = ua.includes('Windows') ? 'Windows' : ua.includes('Mac') ? 'Mac' : ua.includes('Linux') ? 'Linux' : ua.includes('Android') ? 'Android' : ua.includes('iPhone') ? 'iPhone' : 'Equipo';
        const browser = ua.includes('Edg/') ? 'Edge' : ua.includes('Chrome/') ? 'Chrome' : ua.includes('Firefox/') ? 'Firefox' : ua.includes('Safari/') ? 'Safari' : 'Navegador';
        return `${os} · ${browser}`;
    } catch {
        return 'PC Sanatorio';
    }
}

// =============================================
// RFC 6238 TOTP (Google / Microsoft Authenticator)
// =============================================

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateTotpSecret(length = 20) {
    const randomBytes = new Uint8Array(length);
    window.crypto.getRandomValues(randomBytes);
    let secret = '';
    for (let i = 0; i < length; i++) {
        secret += BASE32_ALPHABET[randomBytes[i] % 32];
    }
    return secret;
}

export function getTotpUri(usuario, secret) {
    const cleanUser = (usuario || 'usuario').trim();
    const issuer = 'Sanatorio Argentino';
    return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(cleanUser)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

function base32ToBytes(base32) {
    const cleaned = (base32 || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
    let bits = '';
    for (let i = 0; i < cleaned.length; i++) {
        const val = BASE32_ALPHABET.indexOf(cleaned[i]);
        if (val >= 0) bits += val.toString(2).padStart(5, '0');
    }
    const bytes = new Uint8Array(Math.floor(bits.length / 8));
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
    }
    return bytes;
}

async function generateHotp(secretBytes, counter) {
    const counterBytes = new Uint8Array(8);
    let temp = BigInt(counter);
    for (let i = 7; i >= 0; i--) {
        counterBytes[i] = Number(temp & 0xffn);
        temp >>= 8n;
    }
    const cryptoKey = await window.crypto.subtle.importKey(
        'raw',
        secretBytes,
        { name: 'HMAC', hash: 'SHA-1' },
        false,
        ['sign']
    );
    const hmacBuffer = await window.crypto.subtle.sign('HMAC', cryptoKey, counterBytes);
    const hmac = new Uint8Array(hmacBuffer);
    const offset = hmac[hmac.length - 1] & 0x0f;
    const binary =
        ((hmac[offset] & 0x7f) << 24) |
        ((hmac[offset + 1] & 0xff) << 16) |
        ((hmac[offset + 2] & 0xff) << 8) |
        (hmac[offset + 3] & 0xff);
    const otp = binary % 1000000;
    return otp.toString().padStart(6, '0');
}

export async function verifyTotpCode(secret, code) {
    if (!secret || !code) return false;
    const cleanCode = String(code).replace(/\D/g, '');
    if (cleanCode.length !== 6) return false;

    try {
        const secretBytes = base32ToBytes(secret);
        const currentCounter = Math.floor(Date.now() / 1000 / 30);
        // Permitir ventana de ±1 paso (±30 seg) por desfasaje de reloj del celular
        for (const offset of [0, -1, 1]) {
            const expected = await generateHotp(secretBytes, currentCounter + offset);
            if (expected === cleanCode) return true;
        }
        return false;
    } catch (err) {
        console.error('[AuthService] Error validando TOTP:', err);
        return false;
    }
}

// =============================================
// SESSION MANAGEMENT
// =============================================

/**
 * Obtiene el usuario actual de sessionStorage
 * @returns {{ id: string, usuario: string, nombre: string, iniciales: string, rol?: string } | null}
 */
export function getCurrentUser() {
    try {
        const raw = sessionStorage.getItem(SESSION_KEY);
        if (!raw) return null;
        const session = JSON.parse(raw);
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

/**
 * Persiste la sesión definitiva una vez superados el cambio de clave y/o 2FA
 */
export function finalizeSession(user) {
    const session = {
        id: user.id,
        usuario: user.usuario,
        nombre: user.nombre,
        iniciales: user.iniciales || user.nombre?.charAt(0).toUpperCase() || 'U',
        rol: user.rol || 'operador',
        email: user.email || `${user.usuario}@sanatorioargentino.com.ar`,
        telefono_whatsapp: user.telefono_whatsapp || null,
        avatar_url: user.avatar_url || null,
        loginAt: new Date().toISOString(),
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    trackLogin(supabase, user.usuario);
    return session;
}

// =============================================
// LOGIN / LOGOUT / 2FA FLOW
// =============================================

/**
 * Intenta login con usuario y contraseña.
 * Evalúa si el usuario requiere cambio obligatorio de contraseña o verificación 2FA.
 */
export async function login(usuario, password) {
    if (!usuario || !password) {
        return { success: false, error: 'Usuario y contraseña son requeridos' };
    }

    try {
        let normalizedUser = usuario.trim().toLowerCase();
        if (normalizedUser.includes('@')) {
            normalizedUser = normalizedUser.split('@')[0];
        }

        const deviceToken = getOrCreateDeviceToken();

        // Intentar verify_login_v2 (con soporte de must_change_password, 2FA y trusted_devices)
        let { data, error } = await supabase.rpc('verify_login_v2', {
            p_usuario: normalizedUser,
            p_password: password,
            p_device_token: deviceToken,
        });

        // Fallback automático a verify_login clásico por retrocompatibilidad
        if (error) {
            console.warn('[AuthService] Fallback a verify_login:', error.message);
            const fallbackRes = await supabase.rpc('verify_login', {
                p_usuario: normalizedUser,
                p_password: password,
            });
            data = fallbackRes.data;
            error = fallbackRes.error;
        }

        if (error) {
            console.error('[AuthService] RPC error:', error);
            return { success: false, error: 'Error de conexión. Intente nuevamente.' };
        }

        if (!data || data.length === 0) {
            return { success: false, error: 'Usuario o contraseña incorrectos' };
        }

        const user = data[0];
        const mustChangePassword = Boolean(user.must_change_password);
        const requiresMfa = Boolean(user.mfa_enabled) && !Boolean(user.device_trusted);

        // Si necesita cambiar contraseña o validar 2FA, no guardar sesión final todavía
        if (mustChangePassword || requiresMfa) {
            return {
                success: true,
                requiresPasswordChange: mustChangePassword,
                requiresMfa,
                pendingUser: user,
            };
        }

        const session = finalizeSession(user);
        return { success: true, user: session };
    } catch (err) {
        console.error('[AuthService] Login error:', err);
        return { success: false, error: 'Error inesperado: ' + err.message };
    }
}

/**
 * Solicita y envía un código OTP de 6 dígitos por WhatsApp al colaborador
 */
export async function requestWhatsAppOtp(userId, telefonoInput = null) {
    try {
        const { data, error } = await supabase.rpc('generate_user_otp', {
            p_user_id: userId,
            p_telefono: telefonoInput,
        });

        if (error) {
            return { success: false, error: error.message || 'No se pudo generar el código OTP' };
        }

        const code = data?.code;
        const phone = data?.telefono_whatsapp || telefonoInput;
        const nombre = data?.nombre || 'Colaborador/a';

        if (!code || !phone) {
            return { success: false, error: 'Número de WhatsApp inválido' };
        }

        const msgContent =
            `🔐 *SANATORIO ARGENTINO — Seguridad ADM-QUI*\n\n` +
            `Hola *${nombre}*, tu código de verificación en dos pasos (2FA) es:\n\n` +
            `👉 *${code}*\n\n` +
            `⏱️ Válido por 10 minutos. Si no solicitaste este ingreso, comunicate con Innovación y Sistemas.`;

        await sendWhatsAppMessage({
            content: msgContent,
            number: phone,
        });

        return {
            success: true,
            telefono_whatsapp: phone,
        };
    } catch (err) {
        console.error('[AuthService] Error enviando OTP por WhatsApp:', err);
        return {
            success: false,
            error: 'No se pudo enviar el WhatsApp: ' + (err.message || 'Verifique el número ingresado'),
        };
    }
}

/**
 * Verifica el código OTP recibido por WhatsApp y registra el dispositivo por 30 días si corresponde
 */
export async function verifyWhatsAppOtp(userId, code, trustDevice = true) {
    if (!code || String(code).trim().length < 6) {
        return { success: false, error: 'Ingresá el código de 6 dígitos' };
    }
    try {
        const { data, error } = await supabase.rpc('verify_user_otp', {
            p_user_id: userId,
            p_code: String(code).trim(),
            p_trust_device: Boolean(trustDevice),
            p_device_token: getOrCreateDeviceToken(),
            p_device_label: getDeviceLabel(),
        });

        if (error) {
            return { success: false, error: error.message || 'Error al verificar el código' };
        }
        if (!data) {
            return { success: false, error: 'Código incorrecto o expirado' };
        }
        return { success: true };
    } catch (err) {
        return { success: false, error: 'Error verificando código: ' + err.message };
    }
}

/**
 * Verifica el código de Google/Microsoft Authenticator y registra el dispositivo por 30 días
 */
export async function verifyAndSaveTotp(userId, secret, code, trustDevice = true) {
    const isValid = await verifyTotpCode(secret, code);
    if (!isValid) {
        return { success: false, error: 'El código de 6 dígitos del autenticador no es válido o expiró' };
    }

    try {
        const { data, error } = await supabase.rpc('complete_totp_verification', {
            p_user_id: userId,
            p_totp_secret: secret,
            p_trust_device: Boolean(trustDevice),
            p_device_token: getOrCreateDeviceToken(),
            p_device_label: getDeviceLabel(),
        });

        if (error || !data) {
            return { success: false, error: error?.message || 'No se pudo registrar la verificación TOTP' };
        }
        return { success: true };
    } catch (err) {
        return { success: false, error: 'Error: ' + err.message };
    }
}

/**
 * Cierra la sesión del usuario
 */
export function logout() {
    const user = getCurrentUser();
    if (user) trackLogout(supabase, user.usuario);
    sessionStorage.removeItem(SESSION_KEY);
}

// =============================================
// USER MANAGEMENT & ADMIN ABM
// =============================================

export async function adminListUsers() {
    const { data, error } = await supabase.rpc('admin_list_users');
    if (error) throw new Error(error.message);
    return data || [];
}

export async function adminSaveUser(payload) {
    const { data, error } = await supabase.rpc('admin_save_user', {
        p_id: payload.id || null,
        p_usuario: payload.usuario,
        p_nombre: payload.nombre,
        p_password: payload.password || null,
        p_iniciales: payload.iniciales || null,
        p_email: payload.email || null,
        p_telefono_whatsapp: payload.telefono_whatsapp ?? null,
        p_rol: payload.rol || 'operador',
        p_activo: payload.activo ?? true,
        p_must_change_password: payload.must_change_password ?? true,
        p_mfa_enabled: payload.mfa_enabled ?? true,
    });

    if (error) {
        if (error.message?.includes('duplicate') || error.message?.includes('uq_usuarios')) {
            throw new Error(`El usuario "${payload.usuario}" ya existe`);
        }
        throw new Error(error.message);
    }
    return data;
}

export async function adminResetUserSecurity(userId, { resetPassword = false, tempPassword = '123456', resetMfa = false } = {}) {
    const { data, error } = await supabase.rpc('admin_reset_user_security', {
        p_user_id: userId,
        p_reset_password: resetPassword,
        p_temp_password: tempPassword,
        p_reset_mfa: resetMfa,
    });
    if (error) throw new Error(error.message);
    return data;
}

/**
 * Crea un nuevo usuario (compatibilidad legado)
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
        .from('admqui_usuarios')
        .select('id, usuario, nombre, iniciales, email, telefono_whatsapp, rol, activo, must_change_password, mfa_enabled, mfa_method, ultimo_login, created_at, avatar_url')
        .order('nombre');

    if (error) throw new Error(error.message);
    return data || [];
}

/**
 * Desactiva/activa un usuario
 */
export async function toggleUserActive(userId, activo) {
    const { error } = await supabase
        .from('admqui_usuarios')
        .update({ activo })
        .eq('id', userId);

    if (error) throw new Error(error.message);
}

/**
 * Cambia la contraseña del usuario
 */
export async function changePassword(userId, oldPassword, newPassword) {
    if (!oldPassword || !newPassword) {
        return { success: false, error: 'Ambas contraseñas son requeridas' };
    }
    if (newPassword.length < 6) {
        return { success: false, error: 'La nueva contraseña debe tener al menos 6 caracteres' };
    }
    if (newPassword.trim() === '123456') {
        return { success: false, error: 'Por seguridad, no podés utilizar la contraseña por defecto "123456"' };
    }

    try {
        const { data, error } = await supabase.rpc('change_password', {
            p_user_id: userId,
            p_old_password: oldPassword,
            p_new_password: newPassword,
        });

        if (error) {
            console.error('[AuthService] Change password error:', error);
            return { success: false, error: 'Error de conexión. Intente nuevamente.' };
        }

        if (data === false) {
            return { success: false, error: 'La contraseña actual es incorrecta' };
        }

        return { success: true };
    } catch (err) {
        return { success: false, error: 'Error: ' + err.message };
    }
}

/**
 * Upload an avatar for a user
 */
export async function uploadAvatar(userId, file) {
    if (!userId || !file) throw new Error('Usuario y archivo son requeridos');

    const fileExt = file.name.split('.').pop();
    const fileName = `${userId}-${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, file, { upsert: true });

    if (uploadError) {
        throw new Error(`Error al subir imagen: ${uploadError.message}`);
    }

    const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);

    const { error: updateError } = await supabase
        .from('admqui_usuarios')
        .update({ avatar_url: publicUrl })
        .eq('id', userId);

    if (updateError) {
        throw new Error(`Error al guardar avatar_url: ${updateError.message}`);
    }

    return publicUrl;
}
