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

// ─── Verificar si estamos dentro del horario de atención operativo (06:30 a 21:00) ───
export function isHorarioAtencion() {
    const now = new Date();
    const hora = now.getHours();
    const minutos = now.getMinutes();
    const totalMin = hora * 60 + minutos;
    // 06:30 (390 min) hasta 21:00 (1260 min)
    return totalMin >= 390 && totalMin <= 1260;
}

// ─── Obtener boxes disponibles AHORA (activos) ───
export async function getBoxesDisponibles() {
    try {
        const boxes = await fetchBoxes();
        const activos = (boxes || []).filter(box =>
            box.activo && box.numero !== 99
        );

        // Si estamos en horario operativo pero ningún box fue encendido manualmente,
        // devolver boxes 1..4 por defecto para no bloquear la emisión de turnos en el kiosco
        if (activos.length === 0 && isHorarioAtencion()) {
            return [
                { numero: 1, activo: true, usuario_nombre: 'Box 1' },
                { numero: 2, activo: true, usuario_nombre: 'Box 2' },
                { numero: 3, activo: true, usuario_nombre: 'Box 3' },
                { numero: 4, activo: true, usuario_nombre: 'Box 4' }
            ];
        }

        return activos;
    } catch (err) {
        console.warn('Error al consultar boxes disponibles, usando fallback:', err);
        return [
            { numero: 1, activo: true, usuario_nombre: 'Box 1' },
            { numero: 2, activo: true, usuario_nombre: 'Box 2' }
        ];
    }
}

// ─── Asignar box con balanceo (el que tenga menos turnos en espera) ───
export async function getBoxBalanceado() {
    const disponibles = await getBoxesDisponibles();
    if (!disponibles || disponibles.length === 0) return 1;

    // Contar turnos en espera y totales por box
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const { data: turnosHoy } = await supabase
        .from('turnos_cola')
        .select('box_asignado, estado')
        .gte('created_at', hoy.toISOString());

    const conteoEspera = {};
    const conteoTotal = {};
    disponibles.forEach(b => { 
        conteoEspera[b.numero] = 0; 
        conteoTotal[b.numero] = 0; 
    });

    (turnosHoy || []).forEach(t => {
        if (conteoTotal[t.box_asignado] !== undefined) {
            conteoTotal[t.box_asignado]++;
            if (['esperando', 'llamando', 'en_atencion'].includes(t.estado)) {
                conteoEspera[t.box_asignado]++;
            }
        }
    });

    // 1. Encontrar el valor mínimo de espera
    let minEspera = Infinity;
    for (const box of disponibles) {
        const c = conteoEspera[box.numero];
        if (c < minEspera) {
            minEspera = c;
        }
    }

    // 2. Filtrar los empatados en espera
    const candidatesEspera = disponibles.filter(box => conteoEspera[box.numero] === minEspera);

    // 3. Desempatar usando el total de turnos atendidos/asignados hoy
    let minTotal = Infinity;
    for (const box of candidatesEspera) {
        const c = conteoTotal[box.numero];
        if (c < minTotal) {
            minTotal = c;
        }
    }

    const finalCandidates = candidatesEspera.filter(box => conteoTotal[box.numero] === minTotal);

    // Seleccionar uno de forma aleatoria si aún hay empate
    const randomBox = finalCandidates[Math.floor(Math.random() * finalCandidates.length)];

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
