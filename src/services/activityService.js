/**
 * Activity Service — Queries for the User Activity Panel
 * 
 * Provides aggregated data about user sessions and module usage.
 */
import { supabase } from '../lib/supabase';

/**
 * Fetch summary of user activity (ranking by hours)
 * @param {string} desde - ISO date string
 * @param {string} hasta - ISO date string
 */
export async function fetchUserActivitySummary(desde, hasta) {
    try {
        const { data, error } = await supabase.rpc('get_user_activity_summary', {
            p_desde: desde,
            p_hasta: hasta,
        });

        if (error) {
            console.error('[ActivityService] fetchUserActivitySummary error:', error);
            return [];
        }

        return data || [];
    } catch (err) {
        console.warn('[ActivityService] fetchUserActivitySummary:', err.message);
        return [];
    }
}

/**
 * Fetch global module usage (which modules are used most)
 * @param {string} desde - ISO date string
 * @param {string} hasta - ISO date string
 */
export async function fetchModuleUsageGlobal(desde, hasta) {
    try {
        const { data, error } = await supabase.rpc('get_module_usage_global', {
            p_desde: desde,
            p_hasta: hasta,
        });

        if (error) {
            console.error('[ActivityService] fetchModuleUsageGlobal error:', error);
            return [];
        }

        return data || [];
    } catch (err) {
        console.warn('[ActivityService] fetchModuleUsageGlobal:', err.message);
        return [];
    }
}

/**
 * Fetch currently active sessions (online users right now)
 */
export async function fetchActiveSessions() {
    try {
        // Sessions with no ended_at and heartbeat within last 3 minutes
        const cutoff = new Date(Date.now() - 3 * 60 * 1000).toISOString();

        const { data, error } = await supabase
            .from('user_sessions')
            .select('id, user_id, usuario, started_at, last_heartbeat')
            .is('ended_at', null)
            .gte('last_heartbeat', cutoff)
            .order('started_at', { ascending: false });

        if (error) {
            console.error('[ActivityService] fetchActiveSessions error:', error);
            return [];
        }

        // For each active session, get current module
        const sessions = data || [];
        for (const session of sessions) {
            const { data: moduleData } = await supabase
                .from('user_module_usage')
                .select('module_id, module_label, entered_at')
                .eq('session_id', session.id)
                .is('left_at', null)
                .order('entered_at', { ascending: false })
                .limit(1)
                .single();

            session.current_module = moduleData || null;
        }

        return sessions;
    } catch (err) {
        console.warn('[ActivityService] fetchActiveSessions:', err.message);
        return [];
    }
}

/**
 * Fetch recent sessions for a specific user
 * @param {string} usuario - Username
 * @param {number} limit - Max sessions
 */
export async function fetchUserSessions(usuario, limit = 20) {
    try {
        const { data, error } = await supabase
            .from('user_sessions')
            .select('id, started_at, ended_at, last_heartbeat, duration_minutes')
            .eq('usuario', usuario)
            .order('started_at', { ascending: false })
            .limit(limit);

        if (error) {
            console.error('[ActivityService] fetchUserSessions error:', error);
            return [];
        }

        return data || [];
    } catch (err) {
        console.warn('[ActivityService] fetchUserSessions:', err.message);
        return [];
    }
}
