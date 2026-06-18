/**
 * boxService.js — Gestión de boxes para cola de turnos
 * Handles: asignación de usuarios, toggle on/off, horarios de bloqueo,
 * disponibilidad en tiempo real, y balanceo de carga
 */
import { supabase } from '../lib/supabase';

// ─── Fetch todos los boxes con su estado ───
export async function fetchBoxes() {
    const { data, error } = await supabase
        .from('turnos_boxes')
        .select('*')
        .order('numero');
    if (error) throw error;
    return data || [];
}

// ─── Asignar usuario a un box ───
export async function asignarBox(boxNumero, userId, userName) {
    // Primero liberar cualquier box que tenga este usuario
    await supabase
        .from('turnos_boxes')
        .update({ usuario_id: null, usuario_nombre: null, updated_at: new Date().toISOString() })
        .eq('usuario_id', userId);

    // Asignar el nuevo box
    const { error } = await supabase
        .from('turnos_boxes')
        .update({
            usuario_id: userId,
            usuario_nombre: userName,
            updated_at: new Date().toISOString(),
        })
        .eq('numero', boxNumero);
    if (error) throw error;
}

// ─── Liberar un box (quitar asignación) ───
export async function liberarBox(boxNumero) {
    const { error } = await supabase
        .from('turnos_boxes')
        .update({
            usuario_id: null,
            usuario_nombre: null,
            updated_at: new Date().toISOString(),
        })
        .eq('numero', boxNumero);
    if (error) throw error;
}

// ─── Toggle encender/apagar un box ───
export async function toggleBoxActivo(boxNumero, activo) {
    const { error } = await supabase
        .from('turnos_boxes')
        .update({ activo, updated_at: new Date().toISOString() })
        .eq('numero', boxNumero);
    if (error) throw error;
}

// ─── Horarios de no-atención ───
export async function fetchHorarios(boxId) {
    const { data, error } = await supabase
        .from('turnos_boxes_horarios')
        .select('*')
        .eq('box_id', boxId)
        .order('hora_inicio');
    if (error) throw error;
    return data || [];
}

export async function fetchAllHorarios() {
    const { data, error } = await supabase
        .from('turnos_boxes_horarios')
        .select('*')
        .order('hora_inicio');
    if (error) throw error;
    return data || [];
}

export async function addHorario(boxId, diaSeamana, horaInicio, horaFin, motivo) {
    const { data, error } = await supabase
        .from('turnos_boxes_horarios')
        .insert({
            box_id: boxId,
            dia_semana: diaSeamana,
            hora_inicio: horaInicio,
            hora_fin: horaFin,
            motivo: motivo || null,
        })
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function removeHorario(horarioId) {
    const { error } = await supabase
        .from('turnos_boxes_horarios')
        .delete()
        .eq('id', horarioId);
    if (error) throw error;
}

// ─── Verificar si un box está bloqueado por horario AHORA ───
function isBoxBloqueado(boxId, horarios) {
    const now = new Date();
    const diaSemana = now.getDay(); // 0=Dom, 1=Lun...6=Sab
    const horaActual = now.toLocaleTimeString('en-GB', {
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false,
    });

    return horarios
        .filter(h => h.box_id === boxId)
        .some(h => {
            // Verificar día (null = todos los días)
            if (h.dia_semana !== null && h.dia_semana !== diaSemana) return false;
            // Verificar rango horario
            return horaActual >= h.hora_inicio && horaActual < h.hora_fin;
        });
}

// ─── Obtener boxes disponibles AHORA (activos + no bloqueados) ───
export async function getBoxesDisponibles() {
    const [boxes, horarios] = await Promise.all([
        fetchBoxes(),
        fetchAllHorarios(),
    ]);

    return boxes.filter(box =>
        box.activo && !isBoxBloqueado(box.id, horarios)
    );
}

// ─── Asignar box con balanceo (el que tenga menos turnos en espera) ───
export async function getBoxBalanceado() {
    const disponibles = await getBoxesDisponibles();
    if (disponibles.length === 0) return null;

    // Contar turnos en espera por box
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const { data: turnosEspera } = await supabase
        .from('turnos_cola')
        .select('box_asignado')
        .in('estado', ['esperando', 'llamando'])
        .gte('created_at', hoy.toISOString());

    const conteo = {};
    disponibles.forEach(b => { conteo[b.numero] = 0; });
    (turnosEspera || []).forEach(t => {
        if (conteo[t.box_asignado] !== undefined) {
            conteo[t.box_asignado]++;
        }
    });

    // Box con menos espera
    let minBox = disponibles[0].numero;
    let minCount = conteo[minBox] ?? Infinity;
    for (const box of disponibles) {
        const c = conteo[box.numero] ?? 0;
        if (c < minCount) {
            minCount = c;
            minBox = box.numero;
        }
    }

    return minBox;
}

// ─── Suscripción Realtime a cambios de boxes ───
export function subscribeToBoxes(callback) {
    const channel = supabase
        .channel('boxes-realtime')
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'turnos_boxes' },
            (payload) => callback(payload)
        )
        .subscribe();

    return () => supabase.removeChannel(channel);
}
