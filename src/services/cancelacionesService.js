import { supabase } from '../lib/supabase';

/**
 * Servicio para la gestión de la Bolsa de Turnos a Cancelar en Contact Center
 */

export async function fetchCancelaciones({ estado = 'todos', search = '', fecha = '' } = {}) {
    try {
        let query = supabase
            .from('contact_center_cancelaciones')
            .select('*')
            .order('created_at', { ascending: false });

        if (estado && estado !== 'todos') {
            query = query.eq('estado', estado);
        }

        if (fecha) {
            query = query.eq('fecha_turno', fecha);
        }

        const { data, error } = await query;
        if (error) {
            console.error('[cancelacionesService] Error consultando cancelaciones:', error);
            return { success: false, error: error.message, casos: [], stats: {} };
        }

        let casos = data || [];

        // Filtro local de búsqueda por DNI, paciente o médico si se especificó
        if (search && search.trim()) {
            const s = search.toLowerCase().trim();
            casos = casos.filter(c => 
                (c.dni && c.dni.includes(s)) ||
                (c.paciente_nombre && c.paciente_nombre.toLowerCase().includes(s)) ||
                (c.medico && c.medico.toLowerCase().includes(s)) ||
                (c.especialidad && c.especialidad.toLowerCase().includes(s)) ||
                (c.phone && c.phone.includes(s))
            );
        }

        // Calcular Estadísticas
        const hoyStr = new Date().toISOString().split('T')[0];
        const todos = data || [];

        const totalPendientes = todos.filter(c => c.estado === 'pendiente').length;
        const totalProcesados = todos.filter(c => c.estado === 'procesado_salus').length;
        const totalDescartados = todos.filter(c => c.estado === 'descartado').length;

        const procesadosHoy = todos.filter(c => 
            c.estado === 'procesado_salus' && 
            c.procesado_at && 
            c.procesado_at.startsWith(hoyStr)
        ).length;

        // Calcular tiempo promedio de procesamiento para los resueltos hoy (en minutos)
        const tiempos = todos
            .filter(c => c.estado === 'procesado_salus' && c.procesado_at && c.created_at)
            .map(c => {
                const diffMs = new Date(c.procesado_at).getTime() - new Date(c.created_at).getTime();
                return Math.max(1, Math.round(diffMs / (1000 * 60)));
            });

        const promedioMinutos = tiempos.length > 0 
            ? Math.round(tiempos.reduce((acc, t) => acc + t, 0) / tiempos.length) 
            : 0;

        return {
            success: true,
            casos,
            stats: {
                totalPendientes,
                totalProcesados,
                totalDescartados,
                procesadosHoy,
                promedioMinutos,
                totalCasos: todos.length
            }
        };
    } catch (err) {
        console.error('[cancelacionesService] Excepción en fetchCancelaciones:', err);
        return { success: false, error: err.message, casos: [], stats: {} };
    }
}

/**
 * Obtener cantidad de cancelaciones pendientes para badges
 */
export async function getPendingCancelacionesCount() {
    try {
        const { count, error } = await supabase
            .from('contact_center_cancelaciones')
            .select('id', { count: 'exact', head: true })
            .eq('estado', 'pendiente');

        if (error) throw error;
        return count || 0;
    } catch (err) {
        console.warn('[cancelacionesService] Error obteniendo count:', err);
        return 0;
    }
}

/**
 * Marcar un turno como cancelado en SALUS por una agente
 */
export async function marcarCanceladoEnSalus({ id, agenteId, agenteNombre, notas = '' }) {
    try {
        const { data, error } = await supabase
            .from('contact_center_cancelaciones')
            .update({
                estado: 'procesado_salus',
                agente_id: agenteId,
                agente_nombre: agenteNombre,
                procesado_at: new Date().toISOString(),
                notas_agente: notas,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return { success: true, data };
    } catch (err) {
        console.error('[cancelacionesService] Error al marcar cancelado:', err);
        return { success: false, error: err.message };
    }
}

/**
 * Descartar un caso (ej. ya estaba cancelado previamente o error de tipeo)
 */
export async function descartarCancelacion({ id, agenteId, agenteNombre, notas = '' }) {
    try {
        const { data, error } = await supabase
            .from('contact_center_cancelaciones')
            .update({
                estado: 'descartado',
                agente_id: agenteId,
                agente_nombre: agenteNombre,
                procesado_at: new Date().toISOString(),
                notas_agente: notas,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return { success: true, data };
    } catch (err) {
        console.error('[cancelacionesService] Error al descartar:', err);
        return { success: false, error: err.message };
    }
}

/**
 * Suscripción realtime para avisar cuando entra una nueva cancelación
 */
export function subscribeToCancelaciones(onUpdate) {
    const channel = supabase
        .channel('realtime_contact_center_cancelaciones')
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'contact_center_cancelaciones' },
            (payload) => {
                if (typeof onUpdate === 'function') {
                    onUpdate(payload);
                }
            }
        )
        .subscribe();

    return () => {
        supabase.removeChannel(channel);
    };
}
