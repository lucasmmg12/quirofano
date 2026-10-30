/**
 * Activity Tracker & Cybersecurity Telemetry — Client-side session, geolocation, module & DLP tracking
 *
 * Tracks:
 * - Session duration (login/app open → logout/close) with heartbeat every 60s
 * - Mandatory fresh Geolocation (GPS/Wi-Fi with maximumAge: 0) on every app open + IP/ISP fallback
 * - Device & Browser telemetry (OS, Browser, Screen, CPU/RAM, Device ID)
 * - Module navigation (time spent per sidebar view)
 * - Data Loss Prevention (DLP) events: bulk copy to clipboard, print screen, data exports
 */
import { supabase, supabaseUrl, supabaseAnonKey } from './supabase';

const HEARTBEAT_INTERVAL = 60_000; // 60 seconds
const DEVICE_ID_STORAGE_KEY = 'admqui_trusted_device_id';

let _sessionId = null;
let _userId = null;
let _usuario = null;
let _nombre = null;
let _heartbeatTimer = null;
let _currentModuleId = null;
let _currentModuleLabel = null;
let _currentModuleEnteredAt = null;
let _isTabVisible = true;
let _dlpListenersAttached = false;
let _geoRetryOnFirstClickAttached = false;

// Contexto de telemetría en memoria para enriquecer cada movimiento en audit_log
let _telemetryContext = {
    ip: null,
    isp_org: null,
    latitud: null,
    longitud: null,
    precision_metros: null,
    geo_permission: 'prompt',
    geo_label: null,
    device_fingerprint: null,
    os_browser: null,
    screen_res: null,
    timezone: null,
};

const _telemetryListeners = new Set();

export function subscribeTelemetry(listener) {
    _telemetryListeners.add(listener);
    listener(_telemetryContext);
    return () => _telemetryListeners.delete(listener);
}

function _notifyTelemetryListeners() {
    for (const fn of _telemetryListeners) {
        try { fn({ ..._telemetryContext }); } catch (_) {}
    }
}

export function getCurrentTelemetryContext() {
    return {
        ..._telemetryContext,
        session_id: _sessionId,
        modulo_actual: _currentModuleId,
        modulo_label: _currentModuleLabel,
    };
}

// =============================================
// DEVICE & BROWSER FINGERPRINTING
// =============================================

function _getOrCreateDeviceId() {
    try {
        let id = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
        if (!id) {
            id = 'DEV-' + Math.random().toString(36).substring(2, 10).toUpperCase() + '-' + Date.now().toString(36).toUpperCase();
            localStorage.setItem(DEVICE_ID_STORAGE_KEY, id);
        }
        return id;
    } catch (_) {
        return 'DEV-SESSION';
    }
}

function _parseOsAndBrowser() {
    if (typeof navigator === 'undefined') return 'Desconocido';
    const ua = navigator.userAgent || '';
    let os = 'SO Desconocido';
    if (ua.includes('Windows NT 10.0')) os = 'Windows 10/11';
    else if (ua.includes('Windows NT')) os = 'Windows';
    else if (ua.includes('Mac OS X')) os = 'macOS';
    else if (ua.includes('Android')) os = 'Android';
    else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
    else if (ua.includes('Linux')) os = 'Linux';

    let browser = 'Navegador';
    if (ua.includes('Edg/')) {
        const m = ua.match(/Edg\/(\d+)/);
        browser = `Edge ${m ? m[1] : ''}`.trim();
    } else if (ua.includes('Chrome/')) {
        const m = ua.match(/Chrome\/(\d+)/);
        browser = `Chrome ${m ? m[1] : ''}`.trim();
    } else if (ua.includes('Firefox/')) {
        const m = ua.match(/Firefox\/(\d+)/);
        browser = `Firefox ${m ? m[1] : ''}`.trim();
    } else if (ua.includes('Safari/') && !ua.includes('Chrome')) {
        browser = 'Safari';
    }

    const screenRes = typeof window !== 'undefined' && window.screen
        ? `${window.screen.width}x${window.screen.height}`
        : '';

    return `${os} · ${browser}${screenRes ? ` (${screenRes})` : ''}`;
}

// =============================================
// IP & GEOLOCATION ACQUISITION (MANDATORY ON APP OPEN)
// =============================================

async function _fetchIpTelemetry() {
    // Intento 1: ipwho.is (HTTPS gratuito, sin CORS restrictivo, devuelve IP + ISP + Ciudad + Lat/Lng aproximada)
    try {
        const res = await fetch('https://ipwho.is/', { signal: AbortSignal.timeout(4500) });
        if (res.ok) {
            const d = await res.json();
            if (d && d.success !== false && d.ip) {
                return {
                    ip: d.ip,
                    city: d.city || null,
                    region: d.region || null,
                    country: d.country_code || d.country || null,
                    isp: d.connection?.isp || d.connection?.org || null,
                    lat: typeof d.latitude === 'number' ? d.latitude : null,
                    lng: typeof d.longitude === 'number' ? d.longitude : null,
                };
            }
        }
    } catch (_) {}

    // Intento 2: ipapi.co
    try {
        const res = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(4000) });
        if (res.ok) {
            const d = await res.json();
            if (d && d.ip) {
                return {
                    ip: d.ip,
                    city: d.city || null,
                    region: d.region || null,
                    country: d.country_name || d.country || null,
                    isp: d.org || null,
                    lat: typeof d.latitude === 'number' ? d.latitude : null,
                    lng: typeof d.longitude === 'number' ? d.longitude : null,
                };
            }
        }
    } catch (_) {}

    // Intento 3: api.ipify.org
    try {
        const res = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(3500) });
        if (res.ok) {
            const d = await res.json();
            if (d && d.ip) return { ip: d.ip };
        }
    } catch (_) {}

    return null;
}

async function _reverseGeocode(lat, lng) {
    try {
        const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1`,
            {
                headers: { 'Accept-Language': 'es' },
                signal: AbortSignal.timeout(4000),
            }
        );
        if (!res.ok) return null;
        const data = await res.json();
        const a = data?.address || {};
        const road = a.road || a.pedestrian || '';
        const house = a.house_number ? ` ${a.house_number}` : '';
        const suburb = a.suburb || a.neighbourhood || '';
        const city = a.city || a.town || a.village || a.state_district || a.state || '';
        const parts = [
            road ? `${road}${house}` : '',
            suburb,
            city,
        ].filter(Boolean);
        return parts.length > 0 ? parts.slice(0, 3).join(', ') : (data?.display_name?.split(',').slice(0, 3).join(',') || null);
    } catch (_) {
        return null;
    }
}

/**
 * Solicita activamente la geolocalización del navegador (con maximumAge: 0 para obligar lectura fresca
 * en cada apertura del programa) y actualiza la sesión activa y el último registro de auditoría.
 */
export async function requestAndRecordGeolocation() {
    if (typeof navigator === 'undefined') return null;

    // Consultar estado actual del permiso si la API Permissions está disponible
    let permState = 'prompt';
    try {
        if (navigator.permissions?.query) {
            const pStatus = await navigator.permissions.query({ name: 'geolocation' });
            permState = pStatus.state;
            pStatus.onchange = () => {
                if (pStatus.state === 'granted') {
                    requestAndRecordGeolocation();
                }
            };
        }
    } catch (_) {}

    const gpsPos = await new Promise((resolve) => {
        if (!navigator.geolocation) {
            resolve({ error: 'unsupported' });
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (pos) => resolve({
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                accuracy: Math.round(pos.coords.accuracy || 0),
            }),
            (err) => resolve({
                error: err.code === 1 ? 'denied' : err.code === 2 ? 'unavailable' : 'timeout',
                message: err.message,
            }),
            {
                enableHighAccuracy: true,
                timeout: 12000,
                maximumAge: 0, // SIEMPRE pedir lectura fresca al abrir el programa
            }
        );
    });

    if (gpsPos && typeof gpsPos.lat === 'number' && typeof gpsPos.lng === 'number') {
        const placeName = await _reverseGeocode(gpsPos.lat, gpsPos.lng);
        _telemetryContext.latitud = Number(gpsPos.lat.toFixed(6));
        _telemetryContext.longitud = Number(gpsPos.lng.toFixed(6));
        _telemetryContext.precision_metros = gpsPos.accuracy;
        _telemetryContext.geo_permission = 'granted';
        _telemetryContext.geo_label = placeName
            ? `${placeName} (GPS ±${gpsPos.accuracy}m)`
            : `${_telemetryContext.latitud}, ${_telemetryContext.longitud} (GPS ±${gpsPos.accuracy}m)`;
    } else {
        _telemetryContext.geo_permission = gpsPos?.error === 'denied' ? 'denied' : (permState || 'fallback_ip');
    }

    _notifyTelemetryListeners();
    await _syncTelemetryToSessionAndAudit();
    return _telemetryContext;
}

async function _syncTelemetryToSessionAndAudit() {
    if (!_sessionId) return;
    try {
        await supabase
            .from('user_sessions')
            .update({
                ip_address: _telemetryContext.ip,
                latitud: _telemetryContext.latitud,
                longitud: _telemetryContext.longitud,
                precision_metros: _telemetryContext.precision_metros,
                geo_permission: _telemetryContext.geo_permission,
                geo_label: _telemetryContext.geo_label,
                isp_org: _telemetryContext.isp_org,
                device_fingerprint: _telemetryContext.device_fingerprint,
                os_browser: _telemetryContext.os_browser,
                metadata: {
                    screen: _telemetryContext.screen_res,
                    timezone: _telemetryContext.timezone,
                    cores: typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || null : null,
                    memory_gb: typeof navigator !== 'undefined' ? navigator.deviceMemory || null : null,
                    connection: typeof navigator !== 'undefined' ? navigator.connection?.effectiveType || null : null,
                },
            })
            .eq('id', _sessionId);
    } catch (err) {
        console.warn('[ActivityTracker] Error actualizando telemetría en sesión:', err.message);
    }
}

// =============================================
// SESSION LIFECYCLE
// =============================================

/**
 * Start a new session for the given user.
 * Called on login AND every time the app opens with an existing session.
 */
export async function startSession(user) {
    if (!user?.id || !user?.usuario) return;

    // Si ya hay una sesión activa para este mismo usuario en esta pestaña, igual refrescamos geolocalización
    if (_sessionId && _usuario === user.usuario) {
        requestAndRecordGeolocation();
        return;
    }

    _userId = user.id;
    _usuario = user.usuario;
    _nombre = user.nombre || user.usuario;

    const deviceId = _getOrCreateDeviceId();
    const osBrowser = _parseOsAndBrowser();
    const screenRes = typeof window !== 'undefined' && window.screen ? `${window.screen.width}x${window.screen.height}` : null;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Argentina/San_Juan';

    _telemetryContext = {
        ..._telemetryContext,
        device_fingerprint: deviceId,
        os_browser: osBrowser,
        screen_res: screenRes,
        timezone: tz,
    };
    _notifyTelemetryListeners();

    try {
        // Close stale sessions for this user first (prevents duplicates from refresh/StrictMode)
        await supabase.rpc('close_stale_sessions', { p_user_id: user.id });

        const { data, error } = await supabase
            .from('user_sessions')
            .insert({
                user_id: user.id,
                usuario: user.usuario,
                user_agent: navigator.userAgent,
                device_fingerprint: deviceId,
                os_browser: osBrowser,
                geo_permission: 'prompt',
            })
            .select('id')
            .single();

        if (error) {
            console.warn('[ActivityTracker] Failed to start session:', error.message);
            return;
        }

        _sessionId = data.id;

        // Start heartbeat
        _startHeartbeat();

        // Listen for tab visibility changes
        document.addEventListener('visibilitychange', _handleVisibilityChange);

        // Listen for tab close
        window.addEventListener('beforeunload', _handleBeforeUnload);

        // Attach DLP cybersecurity listeners (copy, print, export)
        _attachDlpListeners();

        // 1. Obtener IP e ISP en paralelo con Geolocalización GPS obligatoria (maximumAge: 0)
        (async () => {
            const ipData = await _fetchIpTelemetry();
            if (ipData) {
                _telemetryContext.ip = ipData.ip || _telemetryContext.ip;
                _telemetryContext.isp_org = ipData.isp || _telemetryContext.isp_org;
                if (!_telemetryContext.latitud && typeof ipData.lat === 'number') {
                    _telemetryContext.latitud = ipData.lat;
                    _telemetryContext.longitud = ipData.lng;
                    const cityStr = [ipData.city, ipData.region].filter(Boolean).join(', ');
                    _telemetryContext.geo_label = cityStr ? `${cityStr} (Aprox. por IP)` : 'Ubicación por IP';
                }
                _notifyTelemetryListeners();
                await _syncTelemetryToSessionAndAudit();
            }

            await requestAndRecordGeolocation();

            // Registrar evento de Apertura / Inicio de Sesión con telemetría completa en audit_log
            try {
                await supabase.from('audit_log').insert({
                    user_id: _userId,
                    usuario: _usuario,
                    nombre: _nombre,
                    accion: 'apertura_sistema',
                    detalle: {
                        label: 'Apertura de Sistema / Sesión Activa',
                        modulo: _currentModuleId || 'inicio',
                        ip: _telemetryContext.ip,
                        isp: _telemetryContext.isp_org,
                        latitud: _telemetryContext.latitud,
                        longitud: _telemetryContext.longitud,
                        precision_metros: _telemetryContext.precision_metros,
                        geo_permission: _telemetryContext.geo_permission,
                        geo_label: _telemetryContext.geo_label,
                        os_browser: _telemetryContext.os_browser,
                        device_fingerprint: _telemetryContext.device_fingerprint,
                        timestamp: new Date().toISOString(),
                    },
                });
            } catch (_) {}
        })();

        // Si el navegador bloqueó el popup automático de geolocalización al abrir sin gesto previo,
        // reintentar automáticamente en el primer clic del usuario dentro de la ventana.
        if (!_geoRetryOnFirstClickAttached && typeof window !== 'undefined') {
            _geoRetryOnFirstClickAttached = true;
            const retryOnGesture = () => {
                if (_telemetryContext.geo_permission !== 'granted') {
                    requestAndRecordGeolocation();
                }
                window.removeEventListener('click', retryOnGesture, true);
            };
            window.addEventListener('click', retryOnGesture, true);
        }

    } catch (err) {
        console.warn('[ActivityTracker] startSession error:', err.message);
    }
}

/**
 * End the current session.
 * Called on logout.
 */
export async function endSession() {
    if (!_sessionId) return;

    await _closeCurrentModule();
    _stopHeartbeat();

    try {
        const now = new Date().toISOString();
        await supabase
            .from('user_sessions')
            .update({
                ended_at: now,
                last_heartbeat: now,
            })
            .eq('id', _sessionId);
    } catch (err) {
        console.warn('[ActivityTracker] endSession error:', err.message);
    }

    document.removeEventListener('visibilitychange', _handleVisibilityChange);
    window.removeEventListener('beforeunload', _handleBeforeUnload);
    _sessionId = null;
    _userId = null;
    _usuario = null;
}

// =============================================
// DLP (DATA LOSS PREVENTION) & SECURITY LISTENERS
// =============================================

function _attachDlpListeners() {
    if (_dlpListenersAttached || typeof window === 'undefined') return;
    _dlpListenersAttached = true;

    // 1. Detectar copiado de datos al portapapeles (Ctrl+C / Clic derecho Copiar)
    document.addEventListener('copy', () => {
        try {
            if (!_usuario) return;
            const sel = window.getSelection()?.toString() || '';
            const cleanLen = sel.trim().length;
            if (cleanLen < 25) return; // Ignorar copiados cortos triviales
            const preview = sel.trim().replace(/\s+/g, ' ').slice(0, 120);
            supabase.from('audit_log').insert({
                user_id: _userId,
                usuario: _usuario,
                nombre: _nombre || _usuario,
                accion: 'dlp_copia_texto',
                detalle: {
                    label: `Copió texto (${cleanLen} caracteres) en ${_currentModuleLabel || _currentModuleId || 'Sistema'}`,
                    modulo: _currentModuleId || 'inicio',
                    caracteres: cleanLen,
                    muestra: preview,
                    ip: _telemetryContext.ip,
                    latitud: _telemetryContext.latitud,
                    longitud: _telemetryContext.longitud,
                    geo_label: _telemetryContext.geo_label,
                    os_browser: _telemetryContext.os_browser,
                    device_fingerprint: _telemetryContext.device_fingerprint,
                    timestamp: new Date().toISOString(),
                },
            }).then(() => {}).catch(() => {});
        } catch (_) {}
    });

    // 2. Detectar impresión de pantalla / documento (Ctrl+P)
    window.addEventListener('beforeprint', () => {
        try {
            if (!_usuario) return;
            supabase.from('audit_log').insert({
                user_id: _userId,
                usuario: _usuario,
                nombre: _nombre || _usuario,
                accion: 'dlp_impresion',
                detalle: {
                    label: `Impresión de pantalla/documento en ${_currentModuleLabel || _currentModuleId || 'Sistema'}`,
                    modulo: _currentModuleId || 'inicio',
                    ip: _telemetryContext.ip,
                    latitud: _telemetryContext.latitud,
                    longitud: _telemetryContext.longitud,
                    geo_label: _telemetryContext.geo_label,
                    os_browser: _telemetryContext.os_browser,
                    device_fingerprint: _telemetryContext.device_fingerprint,
                    timestamp: new Date().toISOString(),
                },
            }).then(() => {}).catch(() => {});
        } catch (_) {}
    });

    // 3. Detectar clics en botones de Descarga / Exportación (Excel, PDF, CSV)
    document.addEventListener('click', (e) => {
        try {
            if (!_usuario) return;
            const btn = e.target?.closest?.('button, a');
            if (!btn) return;
            const txt = (btn.innerText || btn.getAttribute('title') || '').trim();
            if (!txt) return;
            const tLower = txt.toLowerCase();
            if (
                tLower.includes('excel') ||
                tLower.includes('exportar') ||
                tLower.includes('descargar pdf') ||
                tLower.includes('descargar a excel') ||
                tLower.includes('.xlsx') ||
                tLower.includes('.csv')
            ) {
                supabase.from('audit_log').insert({
                    user_id: _userId,
                    usuario: _usuario,
                    nombre: _nombre || _usuario,
                    accion: 'dlp_exportacion',
                    detalle: {
                        label: `Exportación/Descarga: "${txt.slice(0, 70)}"`,
                        modulo: _currentModuleId || 'inicio',
                        boton: txt.slice(0, 80),
                        ip: _telemetryContext.ip,
                        latitud: _telemetryContext.latitud,
                        longitud: _telemetryContext.longitud,
                        geo_label: _telemetryContext.geo_label,
                        os_browser: _telemetryContext.os_browser,
                        device_fingerprint: _telemetryContext.device_fingerprint,
                        timestamp: new Date().toISOString(),
                    },
                }).then(() => {}).catch(() => {});
            }
        } catch (_) {}
    }, true);
}

// =============================================
// MODULE TRACKING
// =============================================

/**
 * Track navigation to a new module/view.
 * @param {string} moduleId - e.g. 'cirugias', 'mensajeria'
 * @param {string} moduleLabel - e.g. 'Control de Cirugías'
 */
export async function trackModuleChange(moduleId, moduleLabel) {
    _currentModuleId = moduleId;
    _currentModuleLabel = moduleLabel || moduleId;

    if (!_sessionId || !_usuario) return;

    await _closeCurrentModule();

    _currentModuleId = moduleId;
    _currentModuleLabel = moduleLabel || moduleId;
    _currentModuleEnteredAt = new Date();

    try {
        await supabase
            .from('user_module_usage')
            .insert({
                session_id: _sessionId,
                user_id: _userId,
                usuario: _usuario,
                module_id: moduleId,
                module_label: moduleLabel || moduleId,
                entered_at: _currentModuleEnteredAt.toISOString(),
            });
    } catch (err) {
        console.warn('[ActivityTracker] trackModuleChange error:', err.message);
    }
}

// =============================================
// HEARTBEAT
// =============================================

function _startHeartbeat() {
    _stopHeartbeat();
    _heartbeatTimer = setInterval(async () => {
        if (!_sessionId || !_isTabVisible) return;

        try {
            await supabase
                .from('user_sessions')
                .update({ last_heartbeat: new Date().toISOString() })
                .eq('id', _sessionId);
        } catch (err) {
            console.warn('[ActivityTracker] heartbeat error:', err.message);
        }
    }, HEARTBEAT_INTERVAL);
}

function _stopHeartbeat() {
    if (_heartbeatTimer) {
        clearInterval(_heartbeatTimer);
        _heartbeatTimer = null;
    }
}

// =============================================
// VISIBILITY API
// =============================================

function _handleVisibilityChange() {
    _isTabVisible = !document.hidden;

    if (_isTabVisible) {
        _startHeartbeat();
        // Si el usuario vuelve a la pestaña y aún no tenía GPS concedido, intentar actualizar
        if (_telemetryContext.geo_permission !== 'granted') {
            requestAndRecordGeolocation();
        }
    } else {
        _stopHeartbeat();
    }
}

// =============================================
// BEFOREUNLOAD (tab close)
// =============================================

function _handleBeforeUnload() {
    if (!_sessionId) return;

    _closeCurrentModuleSync();

    const url = `${supabaseUrl}/rest/v1/user_sessions?id=eq.${_sessionId}`;
    const now = new Date().toISOString();

    try {
        fetch(url, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'apikey': supabaseAnonKey,
                'Authorization': `Bearer ${supabaseAnonKey}`,
                'Prefer': 'return=minimal',
            },
            body: JSON.stringify({ ended_at: now, last_heartbeat: now }),
            keepalive: true,
        });
    } catch (e) { /* best-effort */ }
}

// =============================================
// INTERNAL HELPERS
// =============================================

async function _closeCurrentModule() {
    if (!_currentModuleId || !_currentModuleEnteredAt || !_sessionId) return;

    const now = new Date();
    const durationSec = Math.round((now - _currentModuleEnteredAt) / 1000);

    try {
        await supabase
            .from('user_module_usage')
            .update({
                left_at: now.toISOString(),
                duration_seconds: durationSec,
            })
            .eq('session_id', _sessionId)
            .eq('module_id', _currentModuleId)
            .is('left_at', null);
    } catch (err) {
        console.warn('[ActivityTracker] _closeCurrentModule error:', err.message);
    }

    _currentModuleEnteredAt = null;
}

function _closeCurrentModuleSync() {
    if (!_currentModuleId || !_currentModuleEnteredAt || !_sessionId) return;

    const now = new Date();
    const durationSec = Math.round((now - _currentModuleEnteredAt) / 1000);

    const url = `${supabaseUrl}/rest/v1/user_module_usage?session_id=eq.${_sessionId}&module_id=eq.${_currentModuleId}&left_at=is.null`;

    try {
        fetch(url, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'apikey': supabaseAnonKey,
                'Authorization': `Bearer ${supabaseAnonKey}`,
                'Prefer': 'return=minimal',
            },
            body: JSON.stringify({
                left_at: now.toISOString(),
                duration_seconds: durationSec,
            }),
            keepalive: true,
        });
    } catch (e) { /* best-effort */ }

    _currentModuleEnteredAt = null;
}
