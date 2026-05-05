/**
 * laboratoriosAuditService.js — Audit logging for Anatomía Patológica
 *
 * Registra TODAS las acciones realizadas por usuarios internos y laboratorios
 * externos. Los logs son visibles solo para usuarios internos del Sanatorio.
 *
 * Campos tracked:
 *   - quien (usuario), cuando (timestamp), qué acción, sobre qué registro,
 *     valores anteriores y nuevos, IP/user-agent inferidos.
 */
import { supabase } from '../lib/supabase';

// ═══════════════════════════════════════════
// Constantes de acciones
// ═══════════════════════════════════════════
export const AUDIT_ACTIONS = {
    // Acciones internas (Sanatorio)
    CLASIFICAR_MODULO:     'clasificar_modulo',
    CAMBIAR_MODULO:        'cambiar_modulo',
    ENVIAR_CARRITO:        'enviar_carrito',
    QUITAR_CARRITO:        'quitar_carrito',
    GENERAR_CONSTANCIA:    'generar_constancia',
    REVERTIR_CONSTANCIA:   'revertir_constancia',
    CAMBIAR_COSEGURO:      'cambiar_coseguro',
    EDITAR_MUESTRAS:       'editar_muestras',
    CAMBIAR_FACTURACION:   'cambiar_facturacion',
    // Acciones externas (Laboratorio)
    LAB_VIEW_RECORDS:      'lab_view_records',
    LAB_UPDATE_RESULTADO:  'lab_update_resultado',
    LAB_LOGIN:             'lab_login',
};

// Usuarios de laboratorio (externos)
export const LAB_USERS = ['aguero', 'cedap', 'cuyo'];

/**
 * Determina si el usuario es un laboratorio externo
 */
export function isLabUser(currentUser) {
    if (!currentUser) return false;
    const u = (currentUser.usuario || currentUser.email || '').toLowerCase().split('@')[0];
    return LAB_USERS.includes(u);
}

/**
 * Obtiene el nombre del laboratorio a partir del usuario
 */
export function getLabNameFromUser(currentUser) {
    if (!currentUser) return null;
    const u = (currentUser.usuario || currentUser.email || '').toLowerCase().split('@')[0];
    const map = {
        'aguero': 'LDA - Dra. Aguero o Dra Rios',
        'cedap':  'LAB. CEDAP',
        'cuyo':   'LAB.INST.PATOLOG.CUYO',
    };
    return map[u] || null;
}

// ═══════════════════════════════════════════
// Logging — INSERT
// ═══════════════════════════════════════════

/**
 * Registra una acción en el audit log
 * @param {object} params
 * @param {string} params.accion       - Tipo de acción (de AUDIT_ACTIONS)
 * @param {string} params.usuario      - Nombre de usuario que ejecutó
 * @param {string} params.usuario_tipo - 'interno' | 'laboratorio'
 * @param {string} [params.id_visita]  - ID del registro afectado
 * @param {string} [params.paciente]   - Paciente relacionado
 * @param {string} [params.laboratorio]- Laboratorio relacionado
 * @param {object} [params.datos_antes]- Estado anterior (JSON)
 * @param {object} [params.datos_despues]- Estado nuevo (JSON)
 * @param {string} [params.detalle]    - Descripción legible de la acción
 */
export async function logAction({
    accion,
    usuario,
    usuario_tipo = 'interno',
    id_visita = null,
    paciente = null,
    laboratorio = null,
    datos_antes = null,
    datos_despues = null,
    detalle = null,
}) {
    try {
        const { error } = await supabase
            .from('laboratorios_audit_log')
            .insert({
                accion,
                usuario,
                usuario_tipo,
                id_visita,
                paciente,
                laboratorio,
                datos_antes: datos_antes ? JSON.stringify(datos_antes) : null,
                datos_despues: datos_despues ? JSON.stringify(datos_despues) : null,
                detalle,
            });

        if (error) {
            console.warn('[AuditLog] Error al registrar:', error.message);
        }
    } catch (err) {
        // Non-blocking — never break the main flow
        console.warn('[AuditLog] Exception:', err.message);
    }
}

// ═══════════════════════════════════════════
// Querying — SELECT (solo para usuarios internos)
// ═══════════════════════════════════════════

/**
 * Obtener logs del audit trail, con filtros opcionales
 * @param {object} opts
 * @param {number} [opts.limit=100]
 * @param {string} [opts.id_visita]
 * @param {string} [opts.usuario_tipo] - 'interno' | 'laboratorio'
 * @param {string} [opts.accion]
 * @param {string} [opts.fromDate]
 * @param {string} [opts.toDate]
 */
export async function fetchAuditLogs({
    limit = 100,
    id_visita = null,
    usuario_tipo = null,
    accion = null,
    fromDate = null,
    toDate = null,
} = {}) {
    let query = supabase
        .from('laboratorios_audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

    if (id_visita) query = query.eq('id_visita', id_visita);
    if (usuario_tipo) query = query.eq('usuario_tipo', usuario_tipo);
    if (accion) query = query.eq('accion', accion);
    if (fromDate) query = query.gte('created_at', fromDate);
    if (toDate) query = query.lte('created_at', toDate);

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
}

/**
 * Obtener conteo de acciones por usuario en un periodo
 */
export async function fetchAuditSummary({ fromDate, toDate } = {}) {
    const logs = await fetchAuditLogs({ limit: 5000, fromDate, toDate });

    const summary = {};
    logs.forEach(log => {
        const key = `${log.usuario}__${log.usuario_tipo}`;
        if (!summary[key]) {
            summary[key] = { usuario: log.usuario, tipo: log.usuario_tipo, acciones: {}, total: 0 };
        }
        summary[key].acciones[log.accion] = (summary[key].acciones[log.accion] || 0) + 1;
        summary[key].total++;
    });

    return Object.values(summary).sort((a, b) => b.total - a.total);
}

// ═══════════════════════════════════════════
// Action descriptions for display
// ═══════════════════════════════════════════
export const AUDIT_ACTION_LABELS = {
    clasificar_modulo:    { label: 'Clasificó módulo',        icon: '📦', color: '#8B5CF6' },
    cambiar_modulo:       { label: 'Cambió módulo',           icon: '🔄', color: '#F59E0B' },
    enviar_carrito:       { label: 'Envió al carrito',        icon: '🛒', color: '#10B981' },
    quitar_carrito:       { label: 'Quitó del carrito',       icon: '↩️', color: '#EF4444' },
    generar_constancia:   { label: 'Generó constancia',       icon: '📄', color: '#3B82F6' },
    revertir_constancia:  { label: 'Revirtió constancia',     icon: '⏪', color: '#DC2626' },
    cambiar_coseguro:     { label: 'Cambió coseguro',         icon: '💰', color: '#EC4899' },
    editar_muestras:      { label: 'Editó muestras',          icon: '🔬', color: '#6366F1' },
    cambiar_facturacion:  { label: 'Cambió facturación',      icon: '📋', color: '#0EA5E9' },
    lab_view_records:     { label: 'Consultó registros',      icon: '👁️', color: '#94A3B8' },
    lab_update_resultado: { label: 'Actualizó resultado',     icon: '✏️', color: '#F97316' },
    lab_login:            { label: 'Inicio de sesión (Lab)',   icon: '🔑', color: '#64748B' },
};
