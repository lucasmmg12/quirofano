/**
 * Servicio de Auditoría
 * 
 * Registra todas las acciones del usuario en la tabla audit_log.
 * Se usa en conjunto con authService para adjuntar el usuario activo.
 * 
 * Acciones típicas:
 *   - login / logout
 *   - upload_excel_cirugias / upload_excel_presupuestos
 *   - cambio_estado_cirugia
 *   - envio_whatsapp
 *   - edicion_cirugia / eliminacion_cirugia
 *   - creacion_pedido / impresion_pedido
 */
import { supabase } from '../lib/supabase';
import { getCurrentUser } from './authService';


/**
 * Registra una acción en el audit log
 * 
 * @param {string} accion - Tipo de acción (ej: 'login', 'upload_excel', etc.)
 * @param {Object} [detalle={}] - Metadata adicional de la acción
 * @returns {Promise<void>}
 */
export async function logAction(accion, detalle = {}) {
    try {
        const user = getCurrentUser();

        const entry = {
            user_id: user?.id || null,
            usuario: user?.usuario || 'sistema',
            nombre: user?.nombre || 'Sistema',
            accion,
            detalle: {
                ...detalle,
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
        // Audit logging should never break the app
        console.warn('[AuditService] Non-fatal error:', err.message);
    }
}


/**
 * Obtiene el historial de auditoría con filtros opcionales
 * 
 * @param {{ usuario?: string, accion?: string, desde?: string, hasta?: string, limit?: number }} filters
 * @returns {Promise<Array>}
 */
export async function fetchAuditLog(filters = {}) {
    let query = supabase
        .from('audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(filters.limit || 200);

    if (filters.usuario) {
        query = query.eq('usuario', filters.usuario);
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

    const { data, error } = await query;

    if (error) {
        console.error('[AuditService] Error fetching audit log:', error);
        return [];
    }

    return data || [];
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
