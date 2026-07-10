/**
 * Activity Tracker — Client-side session & module tracking
 * 
 * Tracks:
 * - Session duration (login→logout) with heartbeat every 60s
 * - Module navigation (time spent per sidebar view)
 * 
 * Uses Visibility API to pause when tab is hidden.
 * Uses sendBeacon for clean exit on tab close.
 */
import { supabase, supabaseUrl, supabaseAnonKey } from './supabase';

const HEARTBEAT_INTERVAL = 60_000; // 60 seconds

let _sessionId = null;
let _userId = null;
let _usuario = null;
let _heartbeatTimer = null;
let _currentModuleId = null;
let _currentModuleEnteredAt = null;
let _isTabVisible = true;

// =============================================
// SESSION LIFECYCLE
// =============================================

/**
 * Start a new session for the given user.
 * Called on login.
 */
export async function startSession(user) {
    if (_sessionId) return; // Already tracking

    _userId = user.id;
    _usuario = user.usuario;

    try {
        // Close stale sessions for this user first (prevents duplicates from refresh/StrictMode)
        await supabase.rpc('close_stale_sessions', { p_user_id: user.id });

        const { data, error } = await supabase
            .from('user_sessions')
            .insert({
                user_id: user.id,
                usuario: user.usuario,
                user_agent: navigator.userAgent,
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

    // Close current module
    await _closeCurrentModule();

    // Stop heartbeat
    _stopHeartbeat();

    // Mark session as ended
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

    // Cleanup
    document.removeEventListener('visibilitychange', _handleVisibilityChange);
    window.removeEventListener('beforeunload', _handleBeforeUnload);
    _sessionId = null;
    _userId = null;
    _usuario = null;
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
    if (!_sessionId || !_usuario) return;

    // Close previous module
    await _closeCurrentModule();

    // Start tracking new module
    _currentModuleId = moduleId;
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
        // Tab came back to focus — resume heartbeat
        _startHeartbeat();
    } else {
        // Tab hidden — pause heartbeat
        _stopHeartbeat();
    }
}

// =============================================
// BEFOREUNLOAD (tab close)
// =============================================

function _handleBeforeUnload() {
    if (!_sessionId) return;

    // Close current module
    _closeCurrentModuleSync();

    // Mark session ended via fetch+keepalive (supports auth headers unlike sendBeacon)
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
        // Update the most recent module entry for this session + module
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

    _currentModuleId = null;
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

    _currentModuleId = null;
    _currentModuleEnteredAt = null;
}
