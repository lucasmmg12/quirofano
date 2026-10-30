/**
 * Servicio de Auditoría y Trazabilidad de Ciberseguridad
 *
 * Registra todas las acciones del usuario en la tabla audit_log enriquecidas
 * automáticamente con geolocalización GPS/IP, huella de dispositivo y navegador.
 */
import { supabase } from '../lib/supabase';
import { getCurrentUser } from './authService';
import { getCurrentTelemetryContext } from '../lib/activityTracker';

/**
 * Registra una acción en el audit log enriquecida con telemetría de ciberseguridad
 *
 * @param {string} accion - Tipo de acción (ej: 'login', 'Clic', 'upload_excel', etc.)
 * @param {Object} [detalle={}] - Metadata adicional de la acción
 * @returns {Promise<void>}
 */
export async function logAction(accion, detalle = {}) {
    try {
        const user = getCurrentUser();
        const telemetry = getCurrentTelemetryContext();

        const targetUsuario = user?.usuario || detalle?.usuario || 'sistema';
        const targetNombre = user?.nombre || detalle?.nombre || (targetUsuario !== 'sistema' ? targetUsuario : 'Sistema');

        const entry = {
            user_id: user?.id || null,
            usuario: targetUsuario,
            nombre: targetNombre,
            accion,
            detalle: {
                ...detalle,
                modulo: detalle?.modulo || telemetry.modulo_actual || undefined,
                ip: detalle?.ip || telemetry.ip || undefined,
                isp: telemetry.isp_org || undefined,
                latitud: detalle?.latitud ?? telemetry.latitud ?? undefined,
                longitud: detalle?.longitud ?? telemetry.longitud ?? undefined,
                precision_metros: telemetry.precision_metros ?? undefined,
                geo_permission: telemetry.geo_permission || undefined,
                geo_label: telemetry.geo_label || undefined,
                os_browser: telemetry.os_browser || undefined,
                device_fingerprint: telemetry.device_fingerprint || undefined,
                timestamp: new Date().toISOString(),
            },
        };

        const { error } = await supabase
            .from('audit_log')
            .insert(entry);

        if (error) {
            console.error('[AuditService] Error logging action:', error);
        }
    } catch (err) {
        console.warn('[AuditService] Non-fatal error:', err.message);
    }
}

/**
 * Obtiene el historial de auditoría con filtros opcionales y paginación
 */
export async function fetchAuditLog(filters = {}) {
    let query = supabase
        .from('audit_log')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });

    if (filters.limit) {
        const offset = filters.offset || 0;
        query = query.range(offset, offset + filters.limit - 1);
    } else {
        query = query.limit(200);
    }

    if (filters.usuario) {
        query = query.eq('usuario', filters.usuario);
    } else if (filters.search) {
        query = query.or(`usuario.ilike.%${filters.search}%,nombre.ilike.%${filters.search}%`);
    }

    if (filters.accion) {
        query = query.eq('accion', filters.accion);
    }
    if (filters.desde) {
        query = query.gte('created_at', filters.desde);
    }
    if (filters.hasta) {
        query = query.lte('created_at', filters.hasta);
    }

    const { data, error, count } = await query;

    if (error) {
        console.error('[AuditService] Error fetching audit log:', error);
        return { data: [], count: 0 };
    }

    return { data: data || [], count: count || 0 };
}

/**
 * Obtiene los tipos de acciones únicos (para filtros)
 */
export async function getActionTypes() {
    const { data, error } = await supabase
        .from('audit_log')
        .select('accion')
        .limit(1000);

    if (error) return [];

    const unique = [...new Set((data || []).map(r => r.accion))].sort();
    return unique;
}

/**
 * Obtiene el perfil forense y de ciberseguridad completo de un usuario:
 * - Últimos movimientos (10 por defecto, expandible a 30)
 * - Sesiones recientes con Geolocalización GPS/IP, ISP, Navegador y Dispositivo
 * - Estadísticas de uso de módulos (combinando tiempo en user_module_usage + clics en audit_log)
 * - Indicadores DLP (descargas/exportaciones, copiados al portapapeles, impresiones, IPs únicas)
 */
export async function fetchUserCybersecurityProfile(usuario, limitMovements = 30) {
    if (!usuario) return null;

    const [logsRes, sessionsRes, modulesRes] = await Promise.all([
        supabase
            .from('audit_log')
            .select('*')
            .or(`usuario.eq.${usuario},detalle->>usuario.eq.${usuario}`)
            .order('created_at', { ascending: false })
            .limit(250),
        supabase
            .from('user_sessions')
            .select('*')
            .eq('usuario', usuario)
            .order('started_at', { ascending: false })
            .limit(30),
        supabase
            .from('user_module_usage')
            .select('module_id, module_label, duration_seconds, entered_at')
            .eq('usuario', usuario)
            .order('entered_at', { ascending: false })
            .limit(500),
    ]);

    const allLogs = logsRes.data || [];
    const sessions = sessionsRes.data || [];
    const moduleRows = modulesRes.data || [];

    // 1. Última sesión / geolocalización / estado online
    const latestSession = sessions[0] || null;
    const isOnline = latestSession && !latestSession.ended_at && latestSession.last_heartbeat
        ? (Math.abs(Date.now() - new Date(latestSession.last_heartbeat).getTime()) < 5 * 60 * 1000)
        : false;

    // Buscar la última geolocalización disponible (en sesiones o en logs)
    let lastGeo = null;
    for (const s of sessions) {
        if (s.latitud && s.longitud) {
            lastGeo = {
                latitud: s.latitud,
                longitud: s.longitud,
                precision_metros: s.precision_metros,
                geo_permission: s.geo_permission || 'granted',
                geo_label: s.geo_label || `${s.latitud}, ${s.longitud}`,
                ip: s.ip_address || null,
                isp: s.isp_org || null,
                os_browser: s.os_browser || s.user_agent || null,
                device_fingerprint: s.device_fingerprint || null,
                captured_at: s.last_heartbeat || s.started_at,
            };
            break;
        }
    }

    if (!lastGeo) {
        for (const l of allLogs) {
            const det = l.detalle || {};
            if (det.latitud && det.longitud) {
                lastGeo = {
                    latitud: det.latitud,
                    longitud: det.longitud,
                    precision_metros: det.precision_metros || null,
                    geo_permission: det.geo_permission || 'granted',
                    geo_label: det.geo_label || `${det.latitud}, ${det.longitud}`,
                    ip: det.ip || null,
                    isp: det.isp || null,
                    os_browser: det.os_browser || null,
                    device_fingerprint: det.device_fingerprint || null,
                    captured_at: l.created_at,
                };
                break;
            }
        }
    }

    // Si aún no tiene coordenadas pero sí tiene sesión con user_agent / IP
    const lastDeviceTelemetry = lastGeo || (latestSession ? {
        latitud: null,
        longitud: null,
        precision_metros: null,
        geo_permission: latestSession.geo_permission || 'sin_registro',
        geo_label: latestSession.geo_label || 'Se capturará en su próximo acceso activo',
        ip: latestSession.ip_address || null,
        isp: latestSession.isp_org || null,
        os_browser: latestSession.os_browser || latestSession.user_agent || null,
        device_fingerprint: latestSession.device_fingerprint || null,
        captured_at: latestSession.last_heartbeat || latestSession.started_at,
    } : null);

    // 2. Estadísticas de Módulos Usados (Tiempo + Cantidad de Accesos)
    const moduleStatsMap = new Map();

    for (const m of moduleRows) {
        const key = m.module_id || 'inicio';
        const label = m.module_label || key;
        if (!moduleStatsMap.has(key)) {
            moduleStatsMap.set(key, {
                module_id: key,
                label,
                visits: 0,
                seconds: 0,
                last_used: m.entered_at,
            });
        }
        const entry = moduleStatsMap.get(key);
        entry.visits += 1;
        entry.seconds += Math.max(0, Number(m.duration_seconds || 0));
        if (m.entered_at > entry.last_used) entry.last_used = m.entered_at;
    }

    // Complementar con clics de audit_log por si hay módulos visitados antes de user_module_usage
    for (const l of allLogs) {
        const det = l.detalle || {};
        const modId = det.modulo;
        if (!modId) continue;
        const label = det.label || modId;
        if (!moduleStatsMap.has(modId)) {
            moduleStatsMap.set(modId, {
                module_id: modId,
                label,
                visits: 1,
                seconds: 30,
                last_used: l.created_at,
            });
        } else if (moduleRows.length === 0) {
            const entry = moduleStatsMap.get(modId);
            entry.visits += 1;
            entry.seconds += 30;
        }
    }

    const modulesBreakdown = [...moduleStatsMap.values()].sort(
        (a, b) => (b.seconds - a.seconds) || (b.visits - a.visits)
    );
    const totalModuleVisits = modulesBreakdown.reduce((acc, m) => acc + m.visits, 0) || 1;
    const totalModuleSeconds = modulesBreakdown.reduce((acc, m) => acc + m.seconds, 0) || 1;

    modulesBreakdown.forEach(m => {
        m.pctVisits = Math.round((m.visits / totalModuleVisits) * 100);
        m.pctTime = Math.round((m.seconds / totalModuleSeconds) * 100);
        m.minutes = Math.round(m.seconds / 60);
    });

    // 3. Estadísticas Globales de Sesiones y DLP / Ciberseguridad
    const totalMinutesConnected = sessions.reduce((acc, s) => acc + Math.max(1, Number(s.duration_minutes || 0)), 0);
    const distinctIps = new Set();
    const distinctDevices = new Set();

    sessions.forEach(s => {
        if (s.ip_address) distinctIps.add(s.ip_address);
        if (s.device_fingerprint) distinctDevices.add(s.device_fingerprint);
    });
    allLogs.forEach(l => {
        if (l.detalle?.ip) distinctIps.add(l.detalle.ip);
        if (l.detalle?.device_fingerprint) distinctDevices.add(l.detalle.device_fingerprint);
    });

    let exportCount = 0;
    let copyCount = 0;
    let printCount = 0;
    let offHoursCount = 0;

    for (const l of allLogs) {
        const acc = (l.accion || '').toLowerCase();
        if (acc.includes('export') || acc.includes('excel') || acc.includes('pdf') || acc.includes('descarga')) {
            exportCount++;
        }
        if (acc.includes('copia') || acc.includes('copy')) {
            copyCount++;
        }
        if (acc.includes('impresion') || acc.includes('print')) {
            printCount++;
        }
        if (acc === 'login' || acc === 'apertura_sistema') {
            const hr = new Date(l.created_at).getHours();
            if (hr < 6 || hr >= 22) offHoursCount++;
        }
    }

    return {
        usuario,
        isOnline,
        currentModule: modulesBreakdown[0]?.label || null,
        lastDeviceTelemetry,
        recentMovements: allLogs.slice(0, limitMovements),
        totalLogsCount: allLogs.length,
        sessionsCount: sessions.length,
        totalMinutesConnected,
        modulesBreakdown: modulesBreakdown.slice(0, 8),
        dlpSummary: {
            exportCount,
            copyCount,
            printCount,
            offHoursCount,
            distinctIps: [...distinctIps],
            distinctDevices: [...distinctDevices],
        },
        recentSessions: sessions.slice(0, 5),
    };
}
