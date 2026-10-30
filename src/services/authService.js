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

export function generateTotpSecret(length = 16) {
    // IMPORTANTE: En Base32 (RFC 4648) sin padding '=', la longitud DEBE ser múltiplo de 8 (16 o 32 caracteres)
    // para que represente una cantidad exacta de bytes (16 * 5 = 80 bits = 10 bytes).
    // Si no es múltiplo de 8 (ej. 20), Google Authenticator / iPhone rechazan el QR.
    const validLength = length % 8 === 0 ? length : 16;
    const randomBytes = new Uint8Array(validLength);
    window.crypto.getRandomValues(randomBytes);
    let secret = '';
    for (let i = 0; i < validLength; i++) {
        secret += BASE32_ALPHABET[randomBytes[i] % 32];
    }
    return secret;
}

export function getTotpUri(usuario, secret) {
    const cleanUser = (usuario || 'usuario').trim().replace(/[^a-zA-Z0-9._@-]/g, '');
    const issuer = 'SanatorioArgentino';
    return `otpauth://totp/${issuer}:${cleanUser}?secret=${secret}&issuer=${issuer}`;
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

        // 1. Obtener la hora UTC real del servidor para no depender del reloj local de Windows (que puede estar adelantado/atrasado)
        let baseTimestampMs = Date.now();
        try {
            const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/`, { method: 'HEAD', cache: 'no-store' });
            const serverDateStr = resp.headers.get('date');
            if (serverDateStr) {
                const parsed = Date.parse(serverDateStr);
                if (!Number.isNaN(parsed)) {
                    baseTimestampMs = parsed;
                }
            }
        } catch {
            // Si falla el HEAD, usamos Date.now() con ventana extendida
        }

        const serverCounter = Math.floor(baseTimestampMs / 1000 / 30);
        const localCounter = Math.floor(Date.now() / 1000 / 30);

        // Verificar primero contra la hora exacta del servidor (±3 pasos = ±90 seg)
        for (const offset of [0, -1, 1, -2, 2, -3, 3]) {
            const expected = await generateHotp(secretBytes, serverCounter + offset);
            if (expected === cleanCode) return true;
        }

        // Y como respaldo adicional, verificar ventana de ±40 pasos (±20 min) alrededor del reloj de la PC
        for (let delta = 0; delta <= 40; delta++) {
            const offsets = delta === 0 ? [0] : [-delta, delta];
            for (const offset of offsets) {
                const expected = await generateHotp(secretBytes, localCounter + offset);
                if (expected === cleanCode) return true;
            }
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
export function generateSessionToken() {
    if (window.crypto?.randomUUID) {
        return `sess_${window.crypto.randomUUID()}`;
    }
    const arr = new Uint8Array(16);
    window.crypto.getRandomValues(arr);
    return 'sess_' + Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}

export function getCurrentUser() {
    try {
        const raw = sessionStorage.getItem(SESSION_KEY);
        if (!raw) return null;
        const session = JSON.parse(raw);
        if (!session?.id || !session?.usuario) return null;
        if (!session.sessionToken) {
            session.sessionToken = generateSessionToken();
            sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
        }
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
 * Persiste la sesión definitiva una vez superados el cambio de clave, 2FA y control de sesión única
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
        dni: user.dni || null,
        area_sector: user.area_sector || null,
        cargo: user.cargo || null,
        sessionToken: user.sessionToken || generateSessionToken(),
        loginAt: new Date().toISOString(),
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    trackLogin(supabase, user.usuario);
    return session;
}

/**
 * Actualiza los datos del usuario en sessionStorage tras editar su perfil
 */
export function updateCurrentUserSession(partialUser) {
    const current = getCurrentUser();
    if (!current) return null;
    const updated = { ...current, ...partialUser };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(updated));
    return updated;
}

// =============================================
// VALIDACIÓN ESTRICTA DE CELULAR (10 DÍGITOS)
// =============================================

/**
 * Valida que el número de celular cumpla exactamente el formato de 10 dígitos de Argentina
 * Ej: 2645438114 (Código de área sin 0 + número sin 15).
 * NO acepta +549..., ni 549..., ni 15..., ni espacios ni guiones.
 */
export function validateStrictCellphone(phoneInput) {
    const raw = String(phoneInput ?? '');
    if (!raw.trim()) {
        return { valid: false, error: 'El número de celular es obligatorio (ej: 2645438114)' };
    }
    if (raw !== raw.trim() || /\s/.test(raw)) {
        return { valid: false, error: 'No incluyas espacios en blanco. Ingresá solo los 10 números seguidos (ej: 2645438114).' };
    }
    if (raw.includes('+') || raw.includes('-')) {
        return { valid: false, error: 'No uses "+549" ni guiones. Ingresá únicamente los 10 números (ej: 2645438114).' };
    }
    if (!/^\d+$/.test(raw)) {
        return { valid: false, error: 'El celular debe contener únicamente números sin letras ni símbolos (ej: 2645438114).' };
    }
    if (raw.startsWith('549') || raw.startsWith('54')) {
        return { valid: false, error: 'No antepongas 549 ni +549. Ingresá directo el código de área seguido del número (ej: 2645438114).' };
    }
    if (raw.startsWith('0')) {
        return { valid: false, error: 'No antepongas el 0 al código de área. Ejemplo correcto: 2645438114.' };
    }
    if (raw.startsWith('15')) {
        return { valid: false, error: 'No empieces con 15. Ingresá el código de área sin 0 y el número sin 15 (ej: 2645438114).' };
    }
    if (raw.length !== 10) {
        return {
            valid: false,
            error: `El celular debe tener exactamente 10 dígitos (ingresaste ${raw.length}). Formato obligatorio: 2645438114 (sin +549 ni 15).`,
        };
    }
    // Verificar si pusieron 15 después del código de área de 3 o 4 dígitos (ej. 26415...) -> ya daría 12 dígitos, cubierto arriba.
    return { valid: true, clean: raw };
}

/**
 * Convierte un teléfono legado (ej. +5492645438114 o 5492645438114) a 10 dígitos limpios
 * cuando se abre el modal de edición de un usuario existente, para no bloquear el guardado
 * al tilde/destilde de las casillas de seguridad.
 */
export function normalizeLegacyPhoneTo10Digits(phoneInput) {
    if (!phoneInput) return '';
    let digits = String(phoneInput).replace(/\D/g, '');
    if (digits.startsWith('549') && digits.length === 13) {
        digits = digits.slice(3);
    } else if (digits.startsWith('54') && digits.length === 12) {
        digits = digits.slice(2);
    } else if (digits.startsWith('0') && digits.length === 11) {
        digits = digits.slice(1);
    }
    return digits;
}

/**
 * Verifica o reclama la sesión única de un usuario.
 * Si forceTakeover = false y hay otra sesión activa en otro dispositivo (< 90s),
 * devuelve { status: 'conflict', otherDeviceLabel, otherStartedAt, otherLastHeartbeat }.
 */
export async function checkOrClaimUserSession(userId, sessionToken, forceTakeover = false) {
    if (!userId) return { status: 'account_disabled', error: 'Usuario inválido' };
    const tokenToUse = sessionToken || generateSessionToken();
    try {
        const { data, error } = await supabase.rpc('check_or_claim_user_session', {
            p_user_id: userId,
            p_session_token: tokenToUse,
            p_device_token: getOrCreateDeviceToken(),
            p_device_label: getDeviceLabel(),
            p_force_takeover: Boolean(forceTakeover),
        });

        if (error) {
            console.warn('[AuthService] check_or_claim_user_session error:', error.message);
            return { status: 'ok', sessionToken: tokenToUse };
        }

        return {
            status: data?.status || 'ok',
            sessionToken: tokenToUse,
            otherDeviceLabel: data?.other_device_label || 'Otro dispositivo / navegador',
            otherStartedAt: data?.other_started_at || null,
            otherLastHeartbeat: data?.other_last_heartbeat || null,
            error: data?.error || null,
        };
    } catch (err) {
        console.warn('[AuthService] checkOrClaimUserSession fallback:', err.message);
        return { status: 'ok', sessionToken: tokenToUse };
    }
}

/**
 * Fuerza el cierre de la sesión en el otro dispositivo y mantiene activa la sesión en este dispositivo.
 */
export async function reclaimCurrentUserSession(currentUser) {
    if (!currentUser?.id) throw new Error('Sesión no encontrada');
    const newSessionToken = generateSessionToken();
    const res = await checkOrClaimUserSession(currentUser.id, newSessionToken, true);
    if (res.status === 'account_disabled') {
        throw new Error(res.error || 'La cuenta se encuentra deshabilitada');
    }
    const updated = updateCurrentUserSession({ sessionToken: newSessionToken });
    return updated || { ...currentUser, sessionToken: newSessionToken };
}

/**
 * Verifica en tiempo real:
 * 1) Si la cuenta del usuario logueado sigue activa (activo === true)
 * 2) Si otro dispositivo abrió o tomó la sesión en simultáneo (status === 'displaced')
 */
export async function verifyActiveUserSession(userId, sessionToken = null) {
    if (!userId) return { active: false };
    try {
        const current = getCurrentUser();
        const tokenToCheck = sessionToken || current?.sessionToken || null;

        const { data, error } = await supabase.rpc('heartbeat_and_verify_user_session', {
            p_user_id: userId,
            p_session_token: tokenToCheck,
            p_device_token: getOrCreateDeviceToken(),
            p_device_label: getDeviceLabel(),
        });

        if (error || !data) {
            return { active: true, status: 'ok' }; // No desconectar por falla transitoria de red
        }

        return {
            active: Boolean(data.active),
            status: data.status || 'ok',
            otherDeviceLabel: data.other_device_label || 'Otro dispositivo / navegador',
            otherStartedAt: data.other_started_at || null,
            otherLastHeartbeat: data.other_last_heartbeat || null,
            rol: data.rol,
            must_change_password: Boolean(data.must_change_password),
            mfa_enabled: Boolean(data.mfa_enabled),
        };
    } catch {
        return { active: true, status: 'ok' };
    }
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

        // 1. Verificar Checkbox "Cuenta Activa (Habilitada para ingresar al sistema)"
        if (user.activo === false) {
            return {
                success: false,
                error: 'Esta cuenta de usuario se encuentra deshabilitada por el Administrador.',
            };
        }

        // 2. Verificar Checkbox "Exigir que el usuario actualice su contraseña en su próximo ingreso"
        const mustChangePassword = user.must_change_password === true;

        // 3. Verificar Checkbox "Requerir Autenticación Multifactor 2FA"
        const requiresMfa = user.mfa_enabled === true && !Boolean(user.device_trusted);

        // Si necesita cambiar contraseña o validar 2FA, no guardar sesión final todavía
        if (mustChangePassword || requiresMfa) {
            return {
                success: true,
                requiresPasswordChange: mustChangePassword,
                requiresMfa,
                pendingUser: user,
            };
        }

        // 4. Verificar si ya tiene una sesión abierta en otro dispositivo antes de finalizar el ingreso
        const newSessionToken = generateSessionToken();
        const sessionCheck = await checkOrClaimUserSession(user.id, newSessionToken, false);
        if (sessionCheck.status === 'conflict') {
            return {
                success: true,
                requiresSessionTakeover: true,
                conflictInfo: {
                    otherDeviceLabel: sessionCheck.otherDeviceLabel,
                    otherStartedAt: sessionCheck.otherStartedAt,
                    otherLastHeartbeat: sessionCheck.otherLastHeartbeat,
                },
                pendingUser: { ...user, sessionToken: newSessionToken },
            };
        }

        const session = finalizeSession({ ...user, sessionToken: newSessionToken });
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
        if (telefonoInput && String(telefonoInput).trim()) {
            const check = validateStrictCellphone(telefonoInput);
            if (!check.valid) {
                return { success: false, error: check.error };
            }
        }

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
 * Cierra la sesión del usuario y libera el bloqueo de sesión única en la base de datos
 */
export function logout() {
    const user = getCurrentUser();
    if (user) {
        trackLogout(supabase, user.usuario);
        supabase.rpc('release_user_session', {
            p_user_id: user.id,
            p_session_token: user.sessionToken || null,
        }).then(() => {}).catch(() => {});
    }
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
    let cleanPhone = payload.telefono_whatsapp ? String(payload.telefono_whatsapp).trim() : '';
    if (cleanPhone && !payload.skipPhoneValidation) {
        const check = validateStrictCellphone(cleanPhone);
        if (!check.valid) {
            throw new Error(check.error);
        }
        cleanPhone = check.clean;
    }

    const isActivo = payload.activo !== undefined && payload.activo !== null ? Boolean(payload.activo) : true;
    const isMustChangePwd = payload.must_change_password !== undefined && payload.must_change_password !== null
        ? Boolean(payload.must_change_password)
        : true;
    const isMfaEnabled = payload.mfa_enabled !== undefined && payload.mfa_enabled !== null
        ? Boolean(payload.mfa_enabled)
        : true;

    const { data, error } = await supabase.rpc('admin_save_user', {
        p_id: payload.id || null,
        p_usuario: payload.usuario,
        p_nombre: payload.nombre,
        p_password: payload.password || null,
        p_iniciales: payload.iniciales || null,
        p_email: payload.email || null,
        p_telefono_whatsapp: cleanPhone || null,
        p_rol: payload.rol || 'operador',
        p_activo: isActivo,
        p_must_change_password: isMustChangePwd,
        p_mfa_enabled: isMfaEnabled,
        p_dni: payload.dni ?? null,
        p_area_sector: payload.area_sector ?? null,
        p_cargo: payload.cargo ?? null,
        p_avatar_url: payload.avatar_url ?? null,
    });

    if (error) {
        if (error.message?.includes('duplicate') || error.message?.includes('uq_usuarios')) {
            throw new Error(`El usuario "${payload.usuario}" ya existe`);
        }
        throw new Error(error.message);
    }
    return data;
}

// =============================================
// SOLICITUDES DE ALTA DE USUARIO (DESDE LOGIN)
// =============================================

/**
 * Sube una foto de avatar sin requerir usuario existente (para solicitudes de alta)
 */
export async function uploadAvatarFileOnly(file, prefix = 'req') {
    if (!file) throw new Error('Archivo requerido');
    const fileExt = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const safePrefix = String(prefix).replace(/[^a-zA-Z0-9_-]/g, '');
    const fileName = `${safePrefix}-${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, file, { upsert: true });

    if (uploadError) {
        throw new Error(`Error al subir foto: ${uploadError.message}`);
    }

    const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);

    return publicUrl;
}

/**
 * Crea una solicitud de alta de usuario desde la pantalla de Login (sin rol admin)
 */
export async function submitUserAccessRequest(payload) {
    if (!payload.nombre?.trim() || !payload.usuario_sugerido?.trim() || !payload.email?.trim()) {
        throw new Error('Completá Nombre y Apellido, Usuario sugerido y Email');
    }

    const phoneValidation = validateStrictCellphone(payload.telefono_whatsapp);
    if (!phoneValidation.valid) {
        throw new Error(phoneValidation.error);
    }

    const cleanRole = payload.rol_solicitado === 'admin' ? 'operador' : (payload.rol_solicitado || 'operador');
    let cleanUser = payload.usuario_sugerido.trim().toLowerCase();
    if (cleanUser.includes('@')) cleanUser = cleanUser.split('@')[0];
    cleanUser = cleanUser.replace(/[^a-z0-9._-]/g, '');

    if (!cleanUser) {
        throw new Error('El nombre de usuario sugerido no es válido');
    }

    const { data, error } = await supabase
        .from('admqui_solicitudes_usuarios')
        .insert({
            nombre: payload.nombre.trim(),
            dni: payload.dni?.trim() || null,
            usuario_sugerido: cleanUser,
            email: payload.email.trim().toLowerCase(),
            telefono_whatsapp: phoneValidation.clean,
            area_sector: payload.area_sector?.trim() || null,
            cargo: payload.cargo?.trim() || null,
            rol_solicitado: cleanRole,
            motivo: payload.motivo?.trim() || null,
            avatar_url: payload.avatar_url || null,
            estado: 'pendiente',
            os_browser: getDeviceLabel(),
        })
        .select()
        .single();

    if (error) {
        throw new Error(error.message || 'No se pudo enviar la solicitud');
    }

    return data;
}

/**
 * Lista todas las solicitudes de alta de usuario para el panel de Administración
 */
export async function adminListAccessRequests() {
    const { data, error } = await supabase
        .from('admqui_solicitudes_usuarios')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return data || [];
}

/**
 * Aprueba una solicitud de alta de usuario, creando la cuenta en admqui_usuarios
 */
export async function adminApproveAccessRequest(requestId, overrides = {}, adminUsername = 'admin') {
    const { data: reqRow, error: fetchErr } = await supabase
        .from('admqui_solicitudes_usuarios')
        .select('*')
        .eq('id', requestId)
        .single();

    if (fetchErr || !reqRow) {
        throw new Error('No se encontró la solicitud especificada');
    }

    const finalPhone = overrides.telefono_whatsapp ?? reqRow.telefono_whatsapp;
    const phoneCheck = validateStrictCellphone(finalPhone);
    if (!phoneCheck.valid) {
        throw new Error(phoneCheck.error);
    }

    const finalRole = overrides.rol || (reqRow.rol_solicitado === 'admin' ? 'operador' : reqRow.rol_solicitado) || 'operador';
    const finalUsuario = (overrides.usuario || reqRow.usuario_sugerido || '').trim().toLowerCase();
    const initialPassword = overrides.password || '123456';

    const newUserId = await adminSaveUser({
        id: null,
        usuario: finalUsuario,
        nombre: overrides.nombre || reqRow.nombre,
        password: initialPassword,
        email: overrides.email || reqRow.email,
        telefono_whatsapp: phoneCheck.clean,
        rol: finalRole,
        activo: overrides.activo !== undefined ? Boolean(overrides.activo) : true,
        must_change_password: overrides.must_change_password !== undefined ? Boolean(overrides.must_change_password) : true,
        mfa_enabled: overrides.mfa_enabled !== undefined ? Boolean(overrides.mfa_enabled) : true,
        dni: overrides.dni ?? reqRow.dni,
        area_sector: overrides.area_sector ?? reqRow.area_sector,
        cargo: overrides.cargo ?? reqRow.cargo,
        avatar_url: overrides.avatar_url ?? reqRow.avatar_url,
    });

    const { error: updErr } = await supabase
        .from('admqui_solicitudes_usuarios')
        .update({
            estado: 'aprobada',
            notas_admin: overrides.notas_admin || 'Alta aprobada por Administración',
            resuelto_por: adminUsername,
            resuelto_at: new Date().toISOString(),
            usuario_creado_id: newUserId,
        })
        .eq('id', requestId);

    if (updErr) throw new Error(updErr.message);

    // Notificar por WhatsApp al colaborador si está disponible
    try {
        const msg =
            `✅ *SANATORIO ARGENTINO — Alta de Usuario Aprobada*\n\n` +
            `Hola *${overrides.nombre || reqRow.nombre}*, tu solicitud de acceso a la *Plataforma ADM-QUI* fue aprobada.\n\n` +
            `👤 *Usuario:* ${finalUsuario}\n` +
            `🔑 *Clave temporal:* ${initialPassword}\n\n` +
            `Al ingresar por primera vez, el sistema te pedirá elegir tu clave personal y validar el segundo factor (2FA).`;
        await sendWhatsAppMessage({
            content: msg,
            number: phoneCheck.clean,
        });
    } catch (e) {
        console.warn('[AuthService] No se pudo enviar WhatsApp de bienvenida:', e);
    }

    return newUserId;
}

/**
 * Rechaza una solicitud de alta de usuario
 */
export async function adminRejectAccessRequest(requestId, notasAdmin = '', adminUsername = 'admin') {
    const { error } = await supabase
        .from('admqui_solicitudes_usuarios')
        .update({
            estado: 'rechazada',
            notas_admin: notasAdmin || 'Solicitud desestimada',
            resuelto_por: adminUsername,
            resuelto_at: new Date().toISOString(),
        })
        .eq('id', requestId);

    if (error) throw new Error(error.message);
    return true;
}

// =============================================
// PERSONALIZACIÓN DE PERFIL PROPIO DEL USUARIO
// =============================================

export async function getOwnUserProfile(userId) {
    if (!userId) return null;
    const { data, error } = await supabase
        .from('admqui_usuarios')
        .select('id, usuario, nombre, iniciales, email, telefono_whatsapp, rol, avatar_url, dni, area_sector, cargo, ultimo_login, mfa_enabled, mfa_method')
        .eq('id', userId)
        .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
}

export async function updateOwnUserProfile(userId, profileData) {
    if (!userId) throw new Error('Usuario inválido');

    let cleanPhone = null;
    if (profileData.telefono_whatsapp && String(profileData.telefono_whatsapp).trim() !== '') {
        const check = validateStrictCellphone(profileData.telefono_whatsapp);
        if (!check.valid) {
            throw new Error(check.error);
        }
        cleanPhone = check.clean;
    }

    const { data, error } = await supabase.rpc('update_own_user_profile', {
        p_user_id: userId,
        p_nombre: profileData.nombre,
        p_iniciales: profileData.iniciales || null,
        p_telefono_whatsapp: cleanPhone,
        p_email: profileData.email || null,
        p_dni: profileData.dni ?? null,
        p_area_sector: profileData.area_sector ?? null,
        p_cargo: profileData.cargo ?? null,
        p_avatar_url: profileData.avatar_url ?? null,
    });

    if (error) throw new Error(error.message);

    const updatedSession = updateCurrentUserSession({
        nombre: data?.nombre || profileData.nombre,
        iniciales: data?.iniciales || profileData.iniciales,
        telefono_whatsapp: data?.telefono_whatsapp ?? cleanPhone,
        email: data?.email || profileData.email,
        avatar_url: data?.avatar_url ?? profileData.avatar_url,
        dni: data?.dni ?? profileData.dni,
        area_sector: data?.area_sector ?? profileData.area_sector,
        cargo: data?.cargo ?? profileData.cargo,
    });

    return updatedSession || data;
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
