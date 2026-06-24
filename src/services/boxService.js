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

// ─── Obtener boxes disponibles AHORA (activos) ───
export async function getBoxesDisponibles() {
    const boxes = await fetchBoxes();

    return boxes.filter(box =>
        box.activo && box.numero !== 99
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
        .in('estado', ['esperando', 'llamando', 'en_atencion'])
        .gte('created_at', hoy.toISOString());

    const conteo = {};
    disponibles.forEach(b => { conteo[b.numero] = 0; });
    (turnosEspera || []).forEach(t => {
        if (conteo[t.box_asignado] !== undefined) {
            conteo[t.box_asignado]++;
        }
    });

    // Encontrar el valor mínimo de espera
    let minCount = Infinity;
    for (const box of disponibles) {
        const c = conteo[box.numero] ?? 0;
        if (c < minCount) {
            minCount = c;
        }
    }

    // Obtener todos los boxes que tengan ese conteo mínimo (empate)
    const candidates = disponibles.filter(box => (conteo[box.numero] ?? 0) === minCount);

    // Seleccionar uno de forma aleatoria entre los empatados
    const randomBox = candidates[Math.floor(Math.random() * candidates.length)];

    return randomBox.numero;
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
