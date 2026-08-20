/**
 * dashboardService.js — KPIs en vivo para el Dashboard operativo
 * Queries livianas a Supabase para el HomePanel
 */
import { supabase } from '../lib/supabase';

/**
 * Obtiene KPIs operativos para el dashboard home.
 * Cada query es independiente — si una falla, las demás siguen.
 */
export async function fetchDashboardKPIs() {
    const today = new Date().toISOString().split('T')[0];
    const results = {
        cirugias_hoy: 0,
        cirugias_sin_confirmar: 0,
        cirugias_semana: 0,
        mensajes_sin_leer: 0,
        deudores_activos: 0,
        deuda_total: 0,
        altas_pendientes: 0,
        turnos_espera: 0,
    };

    // --- Cirugías hoy ---
    try {
        const { count } = await supabase
            .from('surgeries')
            .select('id', { count: 'exact', head: true })
            .eq('fecha_cirugia', today);
        results.cirugias_hoy = count || 0;
    } catch (e) { console.warn('[dashboard] cirugias_hoy error:', e.message); }

    // --- Cirugías sin confirmar (próximas 7 días, estado != azul/rojo/realizada) ---
    try {
        const weekLater = new Date();
        weekLater.setDate(weekLater.getDate() + 7);
        const { count } = await supabase
            .from('surgeries')
            .select('id', { count: 'exact', head: true })
            .gte('fecha_cirugia', today)
            .lte('fecha_cirugia', weekLater.toISOString().split('T')[0])
            .not('status', 'in', '("azul","rojo","realizada","suspendida")');
        results.cirugias_sin_confirmar = count || 0;
    } catch (e) { console.warn('[dashboard] cirugias_sin_confirmar error:', e.message); }

    // --- Cirugías semana ---
    try {
        const weekLater = new Date();
        weekLater.setDate(weekLater.getDate() + 7);
        const { count } = await supabase
            .from('surgeries')
            .select('id', { count: 'exact', head: true })
            .gte('fecha_cirugia', today)
            .lte('fecha_cirugia', weekLater.toISOString().split('T')[0]);
        results.cirugias_semana = count || 0;
    } catch (e) { console.warn('[dashboard] cirugias_semana error:', e.message); }

    // --- Mensajes sin leer ---
    try {
        const { count } = await supabase
            .from('whatsapp_messages')
            .select('id', { count: 'exact', head: true })
            .eq('direction', 'incoming')
            .eq('is_read', false);
        results.mensajes_sin_leer = count || 0;
    } catch (e) { console.warn('[dashboard] mensajes_sin_leer error:', e.message); }

    // --- Deudores activos + deuda total ---
    try {
        const { data } = await supabase
            .from('deudas_pacientes')
            .select('deuda_total')
            .gte('deuda_total', 50000)
            .not('categoria', 'in', '("deuda_cancelada","descuento_liquidacion")');
        if (data) {
            results.deudores_activos = data.length;
            results.deuda_total = data.reduce((s, d) => s + Number(d.deuda_total), 0);
        }
    } catch (e) { console.warn('[dashboard] deudores error:', e.message); }

    // --- Altas pendientes (no finalizadas) ---
    try {
        const { count } = await supabase
            .from('altas_administrativas')
            .select('id', { count: 'exact', head: true })
            .in('estado', ['Procesada', 'En auditoria', 'Prórroga']);
        results.altas_pendientes = count || 0;
    } catch (e) { console.warn('[dashboard] altas_pendientes error:', e.message); }

    return results;
}

/**
 * Obtiene actividad reciente del sistema (últimos 10 eventos)
 */
export async function fetchRecentActivity() {
    try {
        const { data } = await supabase
            .from('surgery_events')
            .select('id, surgery_id, event_type, details, created_at, performed_by')
            .order('created_at', { ascending: false })
            .limit(8);
        return data || [];
    } catch (e) {
        console.warn('[dashboard] recent activity error:', e.message);
        return [];
    }
}

/**
 * Obtiene cirugías urgentes (próximas 48h sin confirmar)
 */
export async function fetchUrgentSurgeries() {
    try {
        const now = new Date();
        const in48h = new Date();
        in48h.setHours(in48h.getHours() + 48);
        const { data } = await supabase
            .from('surgeries')
            .select('id, nombre, fecha_cirugia, medico, status, telefono')
            .gte('fecha_cirugia', now.toISOString().split('T')[0])
            .lte('fecha_cirugia', in48h.toISOString().split('T')[0])
            .not('status', 'in', '("azul","realizada","suspendida")')
            .order('fecha_cirugia', { ascending: true })
            .limit(5);
        return data || [];
    } catch (e) {
        console.warn('[dashboard] urgent surgeries error:', e.message);
        return [];
    }
}
